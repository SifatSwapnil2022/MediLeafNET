# MediLeafNET

**An AI-Driven Multimodal System for Medicinal Plant Discovery and Ethnobotanical Knowledge Retrieval in Bangladesh**

---

## Overview

MediLeafNET is a cutting-edge **AI-powered multimodal system** designed to assist researchers, botanists, and healthcare practitioners in identifying medicinal plants and retrieving ethnobotanical knowledge. By combining **computer vision (ViT)** and **natural language processing (BERT)**, the system bridges visual plant recognition with textual knowledge from research databases and local ethnobotanical records.

This platform is particularly tailored for **Bangladesh’s rich medicinal plant diversity**, supporting scientific research, traditional medicine validation, and public awareness. Research Gap Areas:


<img width="1252" height="643" alt="Research gap" src="https://github.com/user-attachments/assets/524ed468-cd11-431d-8717-0230355bfddf" />

---

## Features

- **Multimodal Recognition:** Combines image-based plant recognition with textual knowledge retrieval for enhanced accuracy.  
- **AI Models Used:** 
  - **ViT (Vision Transformer)** for image classification  
  - **BERT** for text understanding and knowledge extraction  
- **User-Friendly Interface:** Upload plant images and instantly receive identification along with ethnobotanical information.  
- **Ethnobotanical Database Integration:** Includes curated knowledge from local medicinal plant research.  
- **Robust & Scalable:** Designed to handle large datasets with modular architecture.

---

## Workflow

<img width="1350" height="762" alt="WorkFlow" src="https://github.com/user-attachments/assets/605d76d0-859a-4c79-bb8f-3aef97749263" />

---

## Demo: Prediction Interface

### Before Prediction
<img width="1757" height="922" alt="Before_predict" src="https://github.com/user-attachments/assets/07727358-b4dc-4007-9a2d-3b2d47b909a2" />

### After Prediction
<img width="1802" height="912" alt="After_predict" src="https://github.com/user-attachments/assets/fba8173b-cfee-4459-bed8-3617594c8a88" />

---

## Installation

1. **Clone the repository**

```bash
git clone https://github.com/SifatSwapnil2022/MediLeafNET.git
cd MediLeafNET
```
2. **Create a virtual environment**
```bash
python -m venv .venv
```
3. **Activate the virtual environment**
```bash
.venv\Scripts\activate
```
4. **Install dependencies**
```bash
pip install -r requirements.txt
```
5. **Verify installation**
```bash
python -c "import torch; import transformers; import gradio; print('All dependencies installed!')"
```

## Usage
1) Place your plant images in the input_images/ folder.
2) Run the prediction script:
```bash
python predict.py --image_path input_images/your_plant.jpg
```
3) View the predicted plant and ethnobotanical information in the output interface

## Datasets
1) **Images:** All plant images are collected and curated by the MediLeafNET team (**Momena Khatun Zinia, Md Sifatullah Sheikh, Urmi Kirtonia, Mahmudul Haque Sakib**)

2) Textual Knowledge: All ethnobotanical text data is original and collected from local research and documentation.
3) No third-party datasets are used, ensuring proprietary ownership and reproducibility.
   ** special thank you - The National Botanic Garden of Bangladesh (Director) **
   
## Updates & Bug Reporting
- We are continuously improving MediLeafNET.
- To report a bug or issue: Create an Issue on GitHub.
- To suggest an update or feature: Fork the repository, make changes, and submit a Pull Request.

## Acknowledgements
We would like to thank:
- Open-source communities: PyTorch, HuggingFace Transformers, Gradio
- All contributors who assisted with testing and validation

