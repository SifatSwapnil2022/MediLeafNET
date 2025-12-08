import gradio as gr
import os
import torch
from utils.load_models import load_config, load_vit, load_bart
from utils.predict_image import get_image_transform, predict_plant_from_image
from utils.text_gen import load_text_dataset, build_input_from_name, generate_description

# -------------------------
# Load models and config
# -------------------------
cfg = load_config("config.json")
device = torch.device(cfg['device'] if (cfg['device'] == 'cuda' and torch.cuda.is_available()) else 'cpu')

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

vit_ckpt = os.path.join(cfg['vit_checkpoint_path'])
vit_model, checkpoint_classes = load_vit(vit_ckpt, device, model_kwargs)
df = load_text_dataset(cfg['text_csv_path'])

CLASS_NAMES = checkpoint_classes if checkpoint_classes else sorted(df['Plant Name'].unique().tolist())
tokenizer, bart_model = load_bart(cfg['bart_model_dir'], device)
img_transform = get_image_transform(cfg['img_size'])

# -------------------------
# Prediction logic
# -------------------------
def predict_and_generate(img_file):
    if img_file is None:
        return None, "", 0.0, "", "❗ Please upload an image."

    image_path = img_file if isinstance(img_file, str) else img_file.name

    plant_name, confidence = predict_plant_from_image(
        image_path, vit_model, CLASS_NAMES, device, img_transform
    )

    try:
        confidence = float(confidence)
        confidence = max(0.0, min(1.0, confidence))
    except Exception:
        confidence = 0.0

    threshold = float(cfg.get("min_confidence_for_generation", 0.7))

    if confidence < threshold:
        return img_file, plant_name or "Unknown", confidence, "", (
            f"⚠️ Confidence too low (**{confidence:.2f}**). Article not generated."
        )

    input_text = build_input_from_name(plant_name, df)
    article = generate_description(input_text, tokenizer, bart_model, device)

    safe_article = (article or "").strip().replace("\n", "<br>")
    article_html = (
        f"<div id='article-content'>"
        f"<h2>🌿 Detailed Article on <strong class='article-plant-name'>{plant_name}</strong></h2>"
        f"<p>{safe_article}</p>"
        f"</div>"
    )

    return img_file, plant_name, confidence, article_html, ""

# -------------------------
# Tightened CSS with stronger selectors
# -------------------------
custom_css = """
/* Base */
.gradio-container {
    background: linear-gradient(135deg, #eef8ee 0%, #d9f0d9 100%);
    font-family: 'Segoe UI', Roboto, Arial, sans-serif;
    padding: 18px;
    --accent: #0f5a2a;
    color: #07220f;
}

/* Header */
#header-box h1 { 
    font-size: 2.8rem; 
    color: var(--accent); 
    margin: 0; 
    font-weight: 900;
}
#header-box p { font-size: 1.05rem; color:#114d26; margin-top:6px; }

/* Card */
.card {
    background: rgba(255,255,255,0.96);
    padding: 20px;
    border-radius: 14px;
    border: 1px solid rgba(15,90,42,0.06);
    box-shadow: 0 8px 22px rgba(15,90,42,0.04);
}

/* Predicted Plant Name - big white bold on dark green pill */
#predicted-name {
    display: inline-block;
    background: #083616; /* dark green */
    color: #ffffff !important;          /* enforce white */
    font-size: 2.0rem;                  /* very big */
    font-weight: 900 !important;        /* very bold */
    padding: 12px 20px;
    border-radius: 12px;
    letter-spacing: 0.6px;
    box-shadow: 0 6px 10px rgba(0,0,0,0.12);
}

/* Confidence area */
#dashboard-box {
    display: flex;
    align-items: center;
    gap: 18px;
    margin-top: 8px;
}

/* outer circle */
.circular-progress {
    width: 160px;
    height: 160px;
    border-radius: 50%;
    background:
        conic-gradient(
            rgba(20,122,55,0.95) calc(var(--progress) * 1%),
            rgba(200,200,200,0.55) 0
        );
    display: grid;
    place-items: center;
    border: 6px solid rgba(255,255,255,0.65);
    box-shadow: 0 10px 20px rgba(16,50,26,0.12);
    transition: background 0.6s ease, transform 0.3s ease;
}

/* inner white circle - percentage text must be BLACK */
.circular-progress .inner {
    width: 110px;
    height: 110px;
    border-radius: 50%;
    background: #ffffff;
    display: grid;
    place-items: center;
    color: #000000 !important;      /* ensure black */
    font-weight: 900 !important;    /* bold */
    font-size: 1.6rem !important;   /* bigger numeric */
    box-shadow: 0 6px 10px rgba(7,34,15,0.06);
}

/* Confidence text (big black) next to circle */
#confidence-text, #confidence-text strong {
    color: #000000 !important;      /* enforce black */
    font-weight: 900 !important;    /* bold */
    font-size: 1.5rem !important;   /* big */
}

/* Article: black, very bold, big */
#article-content {
    color: #000000 !important;
    font-weight: 800 !important;
    font-size: 1.05rem !important;
    line-height: 1.6 !important;
    margin-top: 12px;
}
#article-content h2 {
    color: #000000 !important;
    font-weight: 900 !important;
    font-size: 1.6rem !important; /* heading bigger */
    margin: 0 0 10px 0;
}
#article-content h2 .article-plant-name {
    color: #000000 !important;     /* ensure plant name in heading is black */
    font-weight: 900 !important;
}
#article-content p {
    font-weight: 800 !important; /* bold */
    color: #000000 !important;
    font-size: 1.05rem !important; /* big */
    margin: 0;
}

/* Make sure errors are visible */
.error-msg {
    color: #7a1a00;
    background: #fff1f0;
    padding: 8px 12px;
    border-radius: 8px;
    border: 1px solid rgba(122,26,0,0.07);
    font-weight: 700;
}

/* Image preview */
.gradio-container .gr-image { border-radius: 8px; border: 1px solid rgba(7,34,15,0.04); }

/* Responsive */
@media (max-width: 900px) {
    .circular-progress { width: 120px; height: 120px; }
    .circular-progress .inner { width: 82px; height: 82px; font-size: 1.05rem; }
    #predicted-name { font-size: 1.3rem; padding: 10px 14px; }
    #confidence-text { font-size: 1.2rem; }
}
"""

# -------------------------
# Build Gradio UI
# -------------------------
with gr.Blocks(title="🌿 MediLeafNET") as demo:
    gr.HTML(f"<style>{custom_css}</style>")

    # Header
    with gr.Column(elem_id="header-box"):
        gr.Markdown("<h1>🌿 MediLeafNET</h1>")
        gr.Markdown("<p>AI-Powered Plant Identifier & Knowledge Retrieval System</p>")

    gr.Markdown("---")

    with gr.Row():
        # LEFT: Upload + Preview
        with gr.Column(scale=1, elem_classes="card"):
            image_input = gr.Image(
                label="📤 Upload Plant Image",
                type="filepath",
                height=320,
                interactive=True
            )

            image_preview = gr.Image(
                label="Uploaded Image Preview",
                interactive=False,
                height=320
            )

            predict_btn = gr.Button("🔍 Identify & Generate", variant="primary")
            clear_btn = gr.Button("🧹 Clear All")

        # RIGHT: Output + Dashboard
        with gr.Column(scale=2, elem_classes="card"):
            # Predicted Plant Name: HTML so we can control exact styling
            plant_name_output = gr.HTML(value="<div id='predicted-name'>No prediction yet</div>", label="Predicted Plant Name")

            gr.HTML("<h4 style='margin-top:10px;margin-bottom:6px;color:#2f6b3a;'>Confidence</h4>")
            confidence_bar = gr.HTML(
                "<div id='dashboard-box'>"
                "<div class='circular-progress' style='--progress:0;'>"
                "<div class='inner'>0%</div>"
                "</div>"
                "<div>"
                "<div id='confidence-text'>Confidence: <strong>0.00</strong></div>"
                "</div>"
                "</div>"
            )

            article_output = gr.HTML(value="<div id='article-content'><h2>🌿 Detailed Article</h2><p>No article generated yet.</p></div>", label="Generated Article")
            error_box = gr.HTML(value="")

    # -------------------------
    # Update dashboard function
    # -------------------------
    def update_dashboard(img_file):
        try:
            _, plant_name, confidence, article_html, error = predict_and_generate(img_file)
        except Exception as e:
            return img_file, "<div id='predicted-name'>Error</div>", "<div class='error-msg'>Unexpected error when predicting. Check logs.</div>", "", f"❗ {str(e)}"

        plant_display = plant_name or "Unknown"
        plant_html = f"<div id='predicted-name'>{plant_display}</div>"

        try:
            conf_val = float(confidence)
        except Exception:
            conf_val = 0.0
        conf_percent = int(conf_val * 100)

        circular_html = (
            f"<div id='dashboard-box'>"
            f"<div class='circular-progress' style='--progress:{conf_percent};'>"
            f"<div class='inner'>{conf_percent}%</div>"
            f"</div>"
            f"<div>"
            f"<div id='confidence-text'>Confidence: <strong>{conf_val:.2f}</strong></div>"
            f"</div>"
            f"</div>"
        )

        err_display = ""
        if error:
            err_display = f"<div class='error-msg'>{error}</div>"

        return img_file, plant_html, circular_html, article_html, err_display

    # Wire buttons
    predict_btn.click(
        fn=update_dashboard,
        inputs=image_input,
        outputs=[image_preview, plant_name_output, confidence_bar, article_output, error_box],
    )

    clear_btn.click(
        fn=lambda: (None,
                    "<div id='predicted-name'>No prediction yet</div>",
                    "<div id='dashboard-box'><div class='circular-progress' style='--progress:0;'><div class='inner'>0%</div></div><div><div id='confidence-text'>Confidence: <strong>0.00</strong></div></div></div>",
                    "<div id='article-content'><h2>🌿 Detailed Article</h2><p>No article generated yet.</p></div>",
                    ""),
        inputs=None,
        outputs=[image_preview, plant_name_output, confidence_bar, article_output, error_box],
    )

demo.launch()