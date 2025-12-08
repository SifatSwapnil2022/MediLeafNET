# utils/load_models.py
import os
import json
import torch
from transformers import BartTokenizer, BartForConditionalGeneration
from .vit_model import VisionTransformer

def load_config(cfg_path="config.json"):
    """Load configuration from JSON file."""
    with open(cfg_path, "r", encoding="utf-8") as f:
        return json.load(f)

def load_vit(checkpoint_path, device, model_kwargs, num_classes=None):
    """
    Loads a VisionTransformer checkpoint robustly:
    - If checkpoint contains a state_dict, attempts to infer num_classes from 'head.weight'.
    - Reconstructs model with correct num_classes and loads weights.
    Returns: model, classes (if saved in checkpoint)
    """
    if not os.path.exists(checkpoint_path):
        raise FileNotFoundError(f"ViT checkpoint not found: {checkpoint_path}")

    ckpt = torch.load(checkpoint_path, map_location=device)

    # Support two common formats:
    # (A) {'model_state_dict': state_dict, 'classes': [...]}
    # (B) raw state_dict (keys like 'patch_embed.projection.weight', 'head.weight', ...)
    if isinstance(ckpt, dict) and 'model_state_dict' in ckpt:
        state_dict = ckpt['model_state_dict']
        saved_classes = ckpt.get('classes', None)
    else:
        state_dict = ckpt
        saved_classes = None

    # Try to detect head weight in the state_dict
    head_key = None
    for key in ('head.weight', 'head.0.weight', 'head.fc.weight'):
        if key in state_dict:
            head_key = key
            break

    if head_key is not None:
        saved_num_classes = state_dict[head_key].shape[0]
    else:
        # fallback: use provided num_classes arg or model_kwargs default
        saved_num_classes = num_classes or model_kwargs.get('num_classes', 1000)

    # Reconstruct model with the correct number of classes
    model = VisionTransformer(
        img_size=model_kwargs['img_size'],
        patch_size=model_kwargs['patch_size'],
        in_channels=3,
        num_classes=saved_num_classes,
        embed_dim=model_kwargs['embed_dim'],
        depth=model_kwargs['depth'],
        num_heads=model_kwargs['num_heads'],
        mlp_ratio=model_kwargs['mlp_ratio'],
        dropout=model_kwargs['dropout'],
        attn_dropout=model_kwargs['attn_dropout'],
        drop_path=model_kwargs['drop_path'],
    )

    # Load weights
    try:
        model.load_state_dict(state_dict)
    except RuntimeError as e:
        # If strict load fails, try non-strict (this will skip mismatched keys)
        print("[WARN] strict load_state_dict failed; trying non-strict load. Error:", e)
        model.load_state_dict(state_dict, strict=False)

    model.to(device)
    model.eval()

    return model, saved_classes

def load_bart(bart_dir, device):
    tokenizer = BartTokenizer.from_pretrained(bart_dir)
    model = BartForConditionalGeneration.from_pretrained(bart_dir).to(device)
    model.eval()
    return tokenizer, model