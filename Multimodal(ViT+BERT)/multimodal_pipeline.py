# multimodal_pipeline.py
import os
import argparse
import torch
from utils.load_models import load_config, load_vit, load_bart
from utils.predict_image import get_image_transform, predict_plant_from_image
from utils.text_gen import load_text_dataset, build_input_from_name, generate_description

def main(args):
    cfg = load_config(args.config)
    device = torch.device(cfg['device'] if (cfg['device'] == 'cuda' and torch.cuda.is_available()) else 'cpu')
    print(f"[INFO] Using device: {device}")

    # Build model kwargs for ViT
    model_kwargs = {
        'img_size': cfg['img_size'],
        'patch_size': cfg['patch_size'],
        'embed_dim': cfg['embed_dim'],
        'depth': cfg['depth'],
        'num_heads': cfg['num_heads'],
        'mlp_ratio': cfg['mlp_ratio'],
        'dropout': cfg['dropout'],
        'attn_dropout': cfg['attn_dropout'],
        'drop_path': cfg['drop_path']
    }

    vit_ckpt = os.path.join(args.root_dir, cfg['vit_checkpoint_path'])
    vit_model, checkpoint_classes = load_vit(vit_ckpt, device, model_kwargs)

    # Load CSV and build class names if not in checkpoint
    df = load_text_dataset(os.path.join(args.root_dir, cfg['text_csv_path']))
    if checkpoint_classes:
        CLASS_NAMES = checkpoint_classes
    else:
        if 'Plant Name' in df.columns:
            CLASS_NAMES = sorted(df['Plant Name'].unique().tolist())
        else:
            raise RuntimeError("No class names found in ViT checkpoint or CSV.")

    # Load BART
    bart_dir = os.path.join(args.root_dir, cfg['bart_model_dir'])
    tokenizer, bart_model = load_bart(bart_dir, device)

    # Transform
    img_transform = get_image_transform(cfg['img_size'])

    # Predict
    img_path = args.image
    plant_name, confidence = predict_plant_from_image(img_path, vit_model, CLASS_NAMES, device, img_transform)
    print(f"[RESULT] Predicted: {plant_name} (confidence = {confidence:.4f})")

    threshold = cfg.get('min_confidence_for_generation', 0.7)
    if confidence < threshold:
        print(f"[WARNING] Confidence below threshold ({threshold}). Generation skipped.")
        return

    # Build text input and generate article
    input_text = build_input_from_name(plant_name, df)
    article = generate_description(input_text, tokenizer, bart_model, device)

    # Print & save
    print("\n[GENERATED ARTICLE]\n")
    print(article)
    out_dir = os.path.join(args.root_dir, "outputs")
    os.makedirs(out_dir, exist_ok=True)
    out_file = os.path.join(out_dir, f"{os.path.basename(img_path)}.article.txt")
    with open(out_file, "w", encoding="utf-8") as f:
        f.write(article)
    print(f"\n[INFO] Article saved to: {out_file}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default="config.json")
    parser.add_argument("--root_dir", default=".", help="Project root (default current dir)")
    parser.add_argument("--image", required=True, help="Path to input image")
    args = parser.parse_args()
    main(args)