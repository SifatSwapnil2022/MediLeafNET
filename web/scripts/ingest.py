"""Build the source passages the assistant may cite.

    pip install requests pandas upstash-vector
    python scripts/ingest.py --csv data/CapC_medicinal_plants_with_id.csv --wikipedia

What it writes:
  data/chunks.jsonl        every passage, so you can read exactly what can be cited
  shared/wiki-chunks.ts    the non-CSV passages, bundled into the site and API
                           (this alone makes answers much broader; commit it)

If UPSTASH_VECTOR_REST_URL and UPSTASH_VECTOR_REST_TOKEN are set (and --dry-run is
not), the passages are also upserted to Upstash Vector for semantic search.
Create that index with a built-in embedding model (Dense, cosine) so raw text
can be sent and Upstash does the embedding.

Sources:
  - MediLeafNET plant sheets (the thesis CSV): 4 passages per species
  - Wikipedia article text (CC BY-SA 4.0), when --wikipedia is passed
  - any .md files in data/corpus/ with a first line "species: <Plant_Id>"
"""

from __future__ import annotations

import argparse
import json
import os
import re
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
CSV_URL = "https://github.com/SifatSwapnil2022/MediLeafNET/blob/main/Multimodal(ViT%2BBERT)/CapC_medicinal_plants_with_id.csv"
WIKI_SKIP = {"references", "external links", "see also", "further reading", "notes", "gallery", "bibliography"}
UA = {"User-Agent": "MediLeafNET/1.0 (research demo; github.com/SifatSwapnil2022/MediLeafNET)"}


def sci_name(plant_id: str) -> str:
    genus, species = plant_id.split("_", 1)
    return f"{genus} {species.lower()}"


def sheet_chunks(csv: Path) -> list[dict]:
    """Must stay in step with shared/corpus.ts so offline and live cite the same text."""
    import pandas as pd

    rows = []
    for _, r in pd.read_csv(csv).iterrows():
        pid = r["Plant Name"].strip()
        sci = sci_name(pid)
        local = r["Local Name"].strip()
        local = "No common local name" if local in {"—", "-"} else local
        region = r["Region"].strip().rstrip(".")
        base = {"species": pid, "title": f"MediLeafNET plant sheet: {sci}", "url": CSV_URL}
        rows += [
            {**base, "id": f"{pid}::overview", "text": f"{sci} (local name: {local}) is found in {region}. Traditional medicinal uses: {r['Medical Uses'].strip()}"},
            {**base, "id": f"{pid}::compounds", "text": f"Active compounds reported in {sci}: {r['Active Compounds'].strip()}"},
            {**base, "id": f"{pid}::evidence", "text": f"Clinical evidence for {sci}: {r['Clinical Evidence'].strip()}"},
            {**base, "id": f"{pid}::safety", "text": f"Side effects and safety of {sci}: {r['Side Effects'].strip()}"},
        ]
    return rows


def split_words(text: str, size: int = 140, overlap: int = 30) -> list[str]:
    words = text.split()
    if len(words) <= size:
        return [text]
    out, i = [], 0
    while i < len(words):
        out.append(" ".join(words[i : i + size]))
        i += size - overlap
    return out


def wikipedia_chunks(plant_ids: list[str]) -> list[dict]:
    rows = []
    for pid in plant_ids:
        title = sci_name(pid)
        page = None
        for attempt in range(4):
            try:
                r = requests.get(
                    "https://en.wikipedia.org/w/api.php",
                    params={"action": "query", "prop": "extracts|info", "explaintext": 1, "inprop": "url", "redirects": 1, "titles": title, "format": "json"},
                    headers=UA,
                    timeout=30,
                )
                page = next(iter(r.json()["query"]["pages"].values()))
                break
            except (ValueError, KeyError, requests.RequestException):
                time.sleep(3 * (attempt + 1))
        if page is None:
            print(f"  [skip] Wikipedia did not respond for {title}")
            continue
        if "extract" not in page or not page["extract"].strip():
            print(f"  [skip] no Wikipedia article for {title}")
            continue
        url, page_title = page["fullurl"], page["title"]
        section, n = "Introduction", 0
        for block in re.split(r"\n(?==+ .+ =+\n)", page["extract"]):
            m = re.match(r"(=+) (.+?) =+\n", block)
            if m:
                section = m.group(2).strip()
                block = block[m.end() :]
            if section.lower() in WIKI_SKIP:
                continue
            text = re.sub(r"\s+", " ", block).strip()
            if len(text.split()) < 20:
                continue
            for part in split_words(text):
                rows.append(
                    {
                        "id": f"{pid}::wiki::{n}",
                        "species": pid,
                        "title": f"Wikipedia: {page_title} ({section})",
                        "url": url,
                        "text": f"{sci_name(pid)}. {part}",
                    }
                )
                n += 1
        print(f"  [ok] {page_title}: {n} passages")
        time.sleep(1.5)
    return rows


def local_chunks(folder: Path) -> list[dict]:
    rows = []
    for md in sorted(folder.glob("*.md")):
        lines = md.read_text(encoding="utf-8").splitlines()
        if not lines or not lines[0].startswith("species:"):
            print(f"  [skip] {md.name}: first line must be 'species: <Plant_Id>'")
            continue
        pid = lines[0].split(":", 1)[1].strip()
        meta = dict(l.split(":", 1) for l in lines[1:3] if ":" in l)
        body = "\n".join(lines[3:])
        for i, part in enumerate(split_words(re.sub(r"\s+", " ", body))):
            rows.append({"id": f"{pid}::{md.stem}::{i}", "species": pid, "title": meta.get("title", md.stem).strip(), "url": meta.get("url", "").strip(), "text": part})
    return rows


def upsert(rows: list[dict], reset: bool):
    from upstash_vector import Index

    index = Index(url=os.environ["UPSTASH_VECTOR_REST_URL"], token=os.environ["UPSTASH_VECTOR_REST_TOKEN"])
    if reset:
        index.reset()
        print("[ok] index reset")
    for i in range(0, len(rows), 50):
        batch = rows[i : i + 50]
        # (id, raw text, metadata): Upstash embeds the text with the index's model
        index.upsert([(r["id"], r["text"], {k: r[k] for k in ("species", "title", "url", "text")}) for r in batch])
    print(f"[ok] upserted {len(rows)} passages. Index now: {index.info()}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", type=Path, required=True)
    ap.add_argument("--wikipedia", action="store_true", help="add Wikipedia passages (CC BY-SA 4.0)")
    ap.add_argument("--reset", action="store_true", help="clear the index before upserting")
    ap.add_argument("--dry-run", action="store_true", help="write files only, skip Upstash")
    args = ap.parse_args()

    rows = sheet_chunks(args.csv)
    ids = sorted({r["species"] for r in rows})
    print(f"[ok] {len(rows)} plant-sheet passages for {len(ids)} species")
    if args.wikipedia:
        rows += wikipedia_chunks(ids)
    if (ROOT / "data" / "corpus").exists():
        rows += local_chunks(ROOT / "data" / "corpus")

    out = ROOT / "data" / "chunks.jsonl"
    out.parent.mkdir(exist_ok=True)
    out.write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in rows) + "\n", encoding="utf-8")
    print(f"[ok] wrote {len(rows)} passages to {out.relative_to(ROOT)}")

    extra = [r for r in rows if "::wiki::" in r["id"] or r["id"].count("::") > 1]
    ts = ROOT / "shared" / "wiki-chunks.ts"
    ts.write_text(
        "// GENERATED by scripts/ingest.py. Do not edit by hand.\n"
        "// Wikipedia passages are CC BY-SA 4.0; each keeps its source URL.\n"
        "import type { Chunk } from './corpus.js'\n\n"
        f"export const WIKI_CHUNKS: Chunk[] = {json.dumps(extra, ensure_ascii=False, indent=1)}\n",
        encoding="utf-8",
    )
    print(f"[ok] wrote {len(extra)} extra passages to {ts.relative_to(ROOT)}")

    if args.dry_run:
        return
    if not (os.environ.get("UPSTASH_VECTOR_REST_URL") and os.environ.get("UPSTASH_VECTOR_REST_TOKEN")):
        print("[skip] no Upstash credentials set; the site will use keyword search over the bundled passages")
        return
    upsert(rows, args.reset)


if __name__ == "__main__":
    main()
