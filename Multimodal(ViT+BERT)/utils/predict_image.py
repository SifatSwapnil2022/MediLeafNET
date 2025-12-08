# utils/predict_image.py
from PIL import Image
import torch
import torch.nn.functional as F
from torchvision import transforms

def get_image_transform(img_size=224):
    return transforms.Compose([
        transforms.Resize((img_size, img_size)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406],
                             std=[0.229, 0.224, 0.225]),
    ])

def predict_plant_from_image(image_path, model, class_names, device, img_transform):
    img = Image.open(image_path).convert("RGB")
    img_tensor = img_transform(img).unsqueeze(0).to(device)
    with torch.no_grad():
        outputs, _ = model(img_tensor)
        probs = F.softmax(outputs, dim=1)
        pred_idx = torch.argmax(probs, dim=1).item()
        confidence = float(probs[0, pred_idx].item())
    plant_name = class_names[pred_idx] if class_names else str(pred_idx)
    return plant_name, confidence