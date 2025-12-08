# utils/text_gen.py
import pandas as pd

def load_text_dataset(csv_path):
    df = pd.read_csv(csv_path)
    return df

def build_input_from_name(plant_name: str, df):
    row = df[df['Plant Name'].str.lower() == plant_name.lower()]
    if row.empty:
        raise ValueError(f"Plant '{plant_name}' not found in CSV.")
    row = row.iloc[0]
    input_text = (
        f"Plant name: {row.get('Plant Name','')}. "
        f"Local name: {row.get('Local Name','')}. "
        f"Region: {row.get('Region','')}. "
        f"Medical uses: {row.get('Medical Uses','')}. "
        f"Active compounds: {row.get('Active Compounds','')}. "
        f"Clinical evidence: {row.get('Clinical Evidence','')}. "
        f"Side effects: {row.get('Side Effects','')}. "
        f"Write a detailed, human-like article describing this medicinal plant."
    )
    return input_text

def generate_description(input_text: str, tokenizer, model, device,
                         max_length=600, num_beams=4, do_sample=True,
                         top_p=0.92, temperature=0.9, top_k=50):
    inputs = tokenizer(input_text, return_tensors="pt", truncation=True, padding="max_length", max_length=256).to(device)
    output_ids = model.generate(
        inputs["input_ids"],
        attention_mask=inputs["attention_mask"],
        max_length=max_length,
        num_beams=num_beams,
        do_sample=do_sample,
        top_p=top_p,
        temperature=temperature,
        top_k=top_k,
        early_stopping=True
    )
    return tokenizer.decode(output_ids[0], skip_special_tokens=True)