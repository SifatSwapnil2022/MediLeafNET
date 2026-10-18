"""Export the MediLeafNET ViT checkpoint to ONNX for the browser.

Run once on the machine that has best_vit_model.pth:

    pip install -r scripts/requirements.txt
    python scripts/export_onnx.py \
        --repo "path/to/MediLeafNET/Multimodal(ViT+BERT)" \
        --ckpt "path/to/best_vit_model.pth" \
        --images "path/to/some/test/images"      # optional, for the agreement check

It writes public/model/medileaf_vit_int8.onnx (what the site loads),
public/model/medileaf_vit_fp32.onnx and public/model/labels.json.

The ONNX graph has two outputs:
  logits     [1, 11]
  attention  [1, 6, 197, 197]  last layer, used for the attention overlay
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn

ROOT = Path(__file__).resolve().parents[1]
MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


class Wrapped(nn.Module):
    """The repo's VisionTransformer returns (logits, [attn per layer]).
    ONNX wants plain tensors, and the site only needs the last layer."""

    def __init__(self, vit: nn.Module):
        super().__init__()
        self.vit = vit

    def forward(self, x):
        logits, attns = self.vit(x)
        return logits, attns[-1]


def load_model(repo: Path, ckpt_path: Path, cfg: dict):
    sys.path.insert(0, str(repo))
    from utils.vit_model import VisionTransformer  # noqa: E402  (the thesis code, unchanged)

    ckpt = torch.load(ckpt_path, map_location="cpu", weights_only=False)
    if isinstance(ckpt, dict) and "model_state_dict" in ckpt:
        state, classes = ckpt["model_state_dict"], ckpt.get("classes")
    else:
        state, classes = ckpt, None

    head = next((k for k in ("head.weight", "head.0.weight", "head.fc.weight") if k in state), None)
    num_classes = state[head].shape[0] if head else cfg.get("num_classes", 11)

    model = VisionTransformer(
        img_size=cfg["img_size"],
        patch_size=cfg["patch_size"],
        in_channels=3,
        num_classes=num_classes,
        embed_dim=cfg["embed_dim"],
        depth=cfg["depth"],
        num_heads=cfg["num_heads"],
        mlp_ratio=cfg["mlp_ratio"],
        dropout=cfg["dropout"],
        attn_dropout=cfg["attn_dropout"],
        drop_path=cfg["drop_path"],
    )
    missing, unexpected = model.load_state_dict(state, strict=False)
    if missing or unexpected:
        print(f"[warn] missing keys: {missing}\n[warn] unexpected keys: {unexpected}")
    return model.eval(), classes


def class_names(classes, repo: Path, cfg: dict) -> list[str]:
    # Same rule as the thesis app: checkpoint classes, else sorted CSV names.
    if classes:
        return list(classes)
    import pandas as pd

    csv = Path(cfg.get("text_csv_path", "")).name or "CapC_medicinal_plants_with_id.csv"
    df = pd.read_csv(repo / csv)
    return sorted(df["Plant Name"].unique().tolist())


def preprocess(path: Path, size: int) -> np.ndarray:
    from PIL import Image

    img = Image.open(path).convert("RGB").resize((size, size), Image.BILINEAR)
    a = (np.asarray(img, dtype=np.float32) / 255.0 - MEAN) / STD
    return a.transpose(2, 0, 1)[None].astype(np.float32)


def agreement(onnx_path: Path, model: nn.Module, images: list[Path], size: int) -> float:
    import onnxruntime as ort

    sess = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    same, max_diff = 0, 0.0
    for p in images:
        x = preprocess(p, size)
        with torch.no_grad():
            ref = torch.softmax(model(torch.from_numpy(x))[0], 1).numpy()
        out = sess.run(["logits"], {"input": x})[0]
        prob = np.exp(out - out.max()) / np.exp(out - out.max()).sum()
        same += int(ref.argmax() == prob.argmax())
        max_diff = max(max_diff, float(np.abs(ref - prob).max()))
    print(f"  {onnx_path.name}: top-1 agrees on {same}/{len(images)} images, max prob diff {max_diff:.4f}")
    return same / max(len(images), 1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", type=Path, required=True, help="the Multimodal(ViT+BERT) folder")
    ap.add_argument("--ckpt", type=Path, required=True, help="best_vit_model.pth")
    ap.add_argument("--images", type=Path, help="folder of test images for the agreement check")
    ap.add_argument("--out", type=Path, default=ROOT / "public" / "model")
    args = ap.parse_args()

    cfg = json.loads((args.repo / "config.json").read_text(encoding="utf-8"))
    model, classes = load_model(args.repo, args.ckpt, cfg)
    labels = class_names(classes, args.repo, cfg)
    print(f"[ok] loaded ViT with {sum(p.numel() for p in model.parameters()) / 1e6:.1f}M params, {len(labels)} classes")

    args.out.mkdir(parents=True, exist_ok=True)
    fp32 = args.out / "medileaf_vit_fp32.onnx"
    int8 = args.out / "medileaf_vit_int8.onnx"
    size = cfg["img_size"]
    dummy = torch.randn(1, 3, size, size)

    kwargs = dict(
        input_names=["input"],
        output_names=["logits", "attention"],
        opset_version=17,
        do_constant_folding=True,
    )
    try:
        torch.onnx.export(Wrapped(model), dummy, str(fp32), dynamo=False, **kwargs)
    except TypeError:  # older torch without the dynamo flag
        torch.onnx.export(Wrapped(model), dummy, str(fp32), **kwargs)
    print(f"[ok] wrote {fp32} ({fp32.stat().st_size / 1e6:.1f} MB)")

    from onnxruntime.quantization import QuantType, quantize_dynamic

    quantize_dynamic(str(fp32), str(int8), weight_type=QuantType.QInt8)
    print(f"[ok] wrote {int8} ({int8.stat().st_size / 1e6:.1f} MB)")

    (args.out / "labels.json").write_text(json.dumps(labels, indent=2), encoding="utf-8")
    print(f"[ok] wrote labels.json: {labels}")

    if args.images:
        imgs = sorted(p for p in args.images.rglob("*") if p.suffix.lower() in {".jpg", ".jpeg", ".png"})[:200]
        if imgs:
            print(f"[check] comparing PyTorch and ONNX on {len(imgs)} images")
            agreement(fp32, model, imgs, size)
            if agreement(int8, model, imgs, size) < 0.98:
                print(
                    "[warn] int8 disagrees with PyTorch on more than 2% of images.\n"
                    "       Copy medileaf_vit_fp32.onnx over medileaf_vit_int8.onnx to ship full precision."
                )


if __name__ == "__main__":
    main()
