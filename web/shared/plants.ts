// The 11 species the MediLeafNET ViT was trained on.
// Text fields come from CapC_medicinal_plants_with_id.csv in the MediLeafNET repo.
// `id` matches the class name the model outputs (sorted alphabetically = label index).

export type Risk = 'danger' | 'caution' | 'low'

export interface Plant {
  id: string
  sci: string
  local: string
  region: string
  uses: string
  compounds: string
  evidence: string
  sideEffects: string
  risk: Risk
}

export const PLANTS: Plant[] = [
  {
    "id": "Azadirachta_Indica",
    "sci": "Azadirachta indica",
    "local": "Neem / Nim",
    "region": "Indian Subcontinent (India, Bangladesh, Pakistan, Nepal)",
    "uses": "Used for skin diseases, infections, fever, dental care, blood purifier, diabetes support.",
    "compounds": "Azadirachtin, nimbin, nimbidin, nimbidol, flavonoids, tannins.",
    "evidence": "Strong lab evidence; limited human trials; some proven dental benefits.",
    "sideEffects": "High doses cause liver/kidney toxicity; neem oil dangerous for children.",
    "risk": "caution"
  },
  {
    "id": "Calotropis_Gigantea",
    "sci": "Calotropis gigantea",
    "local": "Akondo / Akanda",
    "region": "South & Southeast Asia",
    "uses": "Used for respiratory issues, fever, pain, skin diseases, wound healing.",
    "compounds": "Cardenolides (calotropin, calotoxin), triterpenoids, flavonoids.",
    "evidence": "Animal-level evidence; no strong clinical trials.",
    "sideEffects": "Highly toxic; cardiac toxicity; latex irritant.",
    "risk": "danger"
  },
  {
    "id": "Datura_Metel",
    "sci": "Datura metel",
    "local": "Dhutura / Dhatura",
    "region": "Tropical regions worldwide",
    "uses": "Traditionally for asthma, cough, pain, sedative; also hallucinogenic.",
    "compounds": "Atropine, scopolamine, hyoscyamine.",
    "evidence": "Well-known active compounds but dangerous; no safe clinical use.",
    "sideEffects": "Extremely poisonous—delirium, seizures, death.",
    "risk": "danger"
  },
  {
    "id": "Gynura_Procumbens",
    "sci": "Gynura procumbens",
    "local": "Sambung Nyawa",
    "region": "Southeast Asia",
    "uses": "Used for diabetes, hypertension, cholesterol, inflammation; edible leaf.",
    "compounds": "Flavonoids, phenolic acids, terpenoids, sterols, saponins.",
    "evidence": "Strong animal evidence; limited human trials.",
    "sideEffects": "Generally safe; possible mild GI upset.",
    "risk": "low"
  },
  {
    "id": "Heliotropium_Angiospermum",
    "sci": "Heliotropium angiospermum",
    "local": "Hatisur (related species)",
    "region": "Tropical Asia & worldwide",
    "uses": "Used for skin diseases, wounds, inflammation, gout.",
    "compounds": "Pyrrolizidine alkaloids, terpenoids, flavonoids.",
    "evidence": "Lab evidence only; PAs cause liver toxicity.",
    "sideEffects": "Can cause serious liver damage.",
    "risk": "danger"
  },
  {
    "id": "Justicia_Adhatoda",
    "sci": "Justicia adhatoda",
    "local": "Basak / Vasaka",
    "region": "South Asia",
    "uses": "Used for cough, asthma, bronchitis, TB support; joint pain.",
    "compounds": "Vasicine, vasicinone, flavonoids, tannins.",
    "evidence": "Strong traditional use; lab evidence; used in modern syrups.",
    "sideEffects": "Avoid high doses; avoid in pregnancy.",
    "risk": "caution"
  },
  {
    "id": "Mikania_Micrantha",
    "sci": "Mikania micrantha",
    "local": "Assam lata",
    "region": "South Asia (invasive weed)",
    "uses": "Used for wounds, fever, nausea, colds, rashes.",
    "compounds": "Sesquiterpene lactones, flavonoids, tannins.",
    "evidence": "Good wound healing results in lab; limited human data.",
    "sideEffects": "Possible allergies; limited safety data.",
    "risk": "caution"
  },
  {
    "id": "Rauvolfia_Tetraphylla",
    "sci": "Rauvolfia tetraphylla",
    "local": "Sarpagandha bon",
    "region": "Tropical Asia & Americas",
    "uses": "Used for hypertension, mental disorders, sedation.",
    "compounds": "Reserpine-type indole alkaloids.",
    "evidence": "Clinically effective family of compounds but risky.",
    "sideEffects": "May cause depression, low BP, sedation.",
    "risk": "caution"
  },
  {
    "id": "Sida_Rhombifolia",
    "sci": "Sida rhombifolia",
    "local": "Bala",
    "region": "Asia, Australia",
    "uses": "Used for diarrhea, fever, inflammation, asthma.",
    "compounds": "Ephedrine-like alkaloids, flavonoids, tannins.",
    "evidence": "Good lab evidence; no major clinical trials.",
    "sideEffects": "Raises BP; causes palpitations; avoid in heart disease.",
    "risk": "caution"
  },
  {
    "id": "Smilax_Zeylanica",
    "sci": "Smilax zeylanica",
    "local": "Ushava",
    "region": "South & Southeast Asia",
    "uses": "Used for venereal diseases, ulcers, arthritis, skin diseases.",
    "compounds": "Steroidal saponins, β-sitosterol, phenolics.",
    "evidence": "Good lab evidence; limited clinical testing.",
    "sideEffects": "Mild GI issues; long-term safety uncertain.",
    "risk": "caution"
  },
  {
    "id": "Wissadula_Periplocifolia",
    "sci": "Wissadula periplocifolia",
    "local": "No common local name",
    "region": "Tropical Americas & Asia",
    "uses": "Used for snake bites, inflammation, antiseptic.",
    "compounds": "Flavonoids (sulphated), phenolics.",
    "evidence": "Animal-level evidence only.",
    "sideEffects": "Limited data; use cautiously.",
    "risk": "caution"
  }
]

export const PLANT_IDS = PLANTS.map((p) => p.id)

export function plantById(id: string): Plant | undefined {
  return PLANTS.find((p) => p.id.toLowerCase() === id.toLowerCase())
}

export const CSV_URL =
  'https://github.com/SifatSwapnil2022/MediLeafNET/blob/main/Multimodal(ViT%2BBERT)/CapC_medicinal_plants_with_id.csv'
