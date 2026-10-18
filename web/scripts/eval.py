"""Score the live pipeline (retrieval + Groq + citation check) through the deployed API.

    python scripts/eval.py --api https://your-app.vercel.app            # writes public/eval/results.json
    python scripts/eval.py --api https://your-app.vercel.app --judge     # also LLM-judge faithfulness (needs GROQ_API_KEY)

Numbers shown on the site come from data/eval_holdout.jsonl, which must never be
used for tuning. Tune MIN_SCORE, prompts and chunking on data/eval_set.jsonl only.

Metrics
  hitAt4            answerable questions where an expected passage was cited
  refusalAccuracy   unanswerable questions that were declined
  wrongRefusals     answerable questions that were declined
  citationCoverage  share of answer sentences that carry a citation
  faithfulness      (--judge) share of cited sentences a second model says the cited passage supports
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
SENT = re.compile(r"(?<=[.!?])(?:\s*\[\d+\])*\s+(?=[A-Z])")


def load(name: str) -> list[dict]:
    return [json.loads(l) for l in (ROOT / "data" / name).read_text(encoding="utf-8").splitlines() if l.strip()]


def ask(api: str, plant: str, question: str) -> dict:
    for attempt in range(4):
        r = requests.post(f"{api.rstrip('/')}/api/ask", json={"plant": plant, "question": question}, timeout=60)
        if r.status_code == 200:
            return r.json()
        if r.status_code in (429, 502):  # Groq free tier rate limit, or upstream hiccup
            time.sleep(4 * (attempt + 1))
            continue
        raise RuntimeError(f"{r.status_code}: {r.text[:200]}")
    raise RuntimeError("gave up after retries")


def judge(sentence: str, sources: list[str]) -> bool:
    from groq import Groq

    client = Groq(api_key=os.environ["GROQ_API_KEY"])
    msg = client.chat.completions.create(
        model=os.environ.get("JUDGE_MODEL", "openai/gpt-oss-20b"),
        temperature=0,
        max_tokens=5,
        messages=[
            {"role": "system", "content": "Reply YES if the claim is fully supported by the passages, otherwise NO. One word."},
            {"role": "user", "content": "Passages:\n" + "\n---\n".join(sources) + f"\n\nClaim: {sentence}"},
        ],
    )
    return msg.choices[0].message.content.strip().upper().startswith("YES")


def score(api: str, rows: list[dict], use_judge: bool) -> dict:
    hits = wrong = right = cited = sents = supported = judged = 0
    failures = []
    for q in rows:
        a = ask(api, q["plant"], q["question"])
        ids = [c["id"] for c in a.get("citations", [])]
        if q["answerable"]:
            if a["refused"]:
                wrong += 1
                failures.append({"id": q["id"], "question": q["question"], "kind": "refused an answerable question"})
            elif any(e in ids[:4] for e in q["expect"]):
                hits += 1
            else:
                failures.append({"id": q["id"], "question": q["question"], "kind": "wrong passage cited"})
        elif a["refused"]:
            right += 1
        else:
            failures.append({"id": q["id"], "question": q["question"], "kind": "answered, should have refused"})

        if not a["refused"] and a.get("answer"):
            parts = [s for s in SENT.split(a["answer"]) if s.strip()]
            sents += len(parts)
            cited += sum(bool(re.search(r"\[\d+\]", s)) for s in parts)
            if use_judge:
                by_n = {c["n"]: c["text"] for c in a["citations"]}
                for s in parts:
                    refs = [int(n) for n in re.findall(r"\[(\d+)\]", s)]
                    if refs:
                        judged += 1
                        supported += judge(re.sub(r"\[\d+\]", "", s), [by_n[n] for n in refs if n in by_n])
        print(f"  {q['id']}  {'refused ' if a['refused'] else 'answered'}  {q['question']}")
        time.sleep(2.2)  # stay under ~30 requests/minute on Groq's free plan

    answerable = sum(q["answerable"] for q in rows)
    out = {
        "questions": len(rows),
        "unanswerable": len(rows) - answerable,
        "hitAt4": hits / max(answerable, 1),
        "refusalAccuracy": right / max(len(rows) - answerable, 1),
        "wrongRefusals": wrong,
        "citationCoverage": cited / sents if sents else 1.0,
        "failures": failures,
    }
    if use_judge and judged:
        out["faithfulness"] = supported / judged
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", required=True, help="base URL of the deployed site")
    ap.add_argument("--judge", action="store_true")
    ap.add_argument("--tuning-only", action="store_true", help="score data/eval_set.jsonl only, don't write results")
    args = ap.parse_args()

    if args.tuning_only:
        print(json.dumps(score(args.api, load("eval_set.jsonl"), args.judge), indent=2))
        return

    print("[held-out]")
    holdout = score(args.api, load("eval_holdout.jsonl"), args.judge)
    print("[tuning]")
    tuning = score(args.api, load("eval_set.jsonl"), False)
    model = ask(args.api, "Sida_Rhombifolia", "What is it used for?").get("model")
    results = {"mode": "live", "set": "holdout", "date": dt.date.today().isoformat(), "model": model, **holdout, "tuning": tuning}
    out = ROOT / "public" / "eval" / "results.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(results, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in results.items() if k not in ("failures", "tuning")}, indent=2))
    print(f"[ok] wrote {out.relative_to(ROOT)}. Commit it and redeploy to update the site.")


if __name__ == "__main__":
    main()
