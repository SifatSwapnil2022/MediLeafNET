# Model card: MediLeafNET ViT (browser build)

| | |
|---|---|
| Task | Single-leaf image classification, 11 medicinal plant species found in Bangladesh |
| Architecture | Vision Transformer written from scratch: 224×224 input, 16×16 patches (196 + 1 class token), 384-d embeddings, 6 layers, 6 heads, MLP ratio 4 |
| Size | About 11M parameters. Shipped as ONNX, dynamically quantized to int8 |
| Input preprocessing | Resize to 224×224 (no crop), scale to [0, 1], normalize with ImageNet mean and std |
| Outputs | Logits for 11 classes; last-layer attention (used for the overlay) |
| Decision rule | Name a plant only if softmax confidence ≥ 0.70, otherwise abstain |
| Reported accuracy | 96%+ on the held-out test split of the thesis (11 classes) |
| Training data | Leaf photos from the MediLeafNET dataset ([DOI 10.17632/9tdc9gbtgb.2](https://doi.org/10.17632/9tdc9gbtgb.2)), collected July to November in Dhaka on iPhone 15 Pro Max and iPhone 14, natural daylight |

## Intended use

Education and research demos: showing how a ViT sees a leaf, and helping someone narrow down what a plant might be before checking with an expert.

## Not intended for

Deciding whether to eat, drink or apply a plant. Medical decisions of any kind.

## Known limitations

- Closed set of 11 species. Out-of-set plants should fall below the threshold, but this is not guaranteed.
- Trained on close-up single-leaf photos. Performance on cluttered field photos has not been measured.
- Augmented images were generated from the originals; make sure test splits are separated by original photo, not by augmented copy, or accuracy will be inflated.
- Int8 quantization is checked against PyTorch by `scripts/export_onnx.py` on your own test photos. Ship the fp32 file if top-1 agreement drops below 98%.

## Safety

Three of the 11 species are poisonous (*Datura metel*, *Calotropis gigantea*, *Heliotropium angiospermum*). The app shows a warning with every identification of these, the answer pipeline restricts them to identification and safety information only, and dose questions are refused for every species.
