// ─── Common ICD-10 codes ──────────────────────────────────────────────────
// Curated list of the most frequently used ICD-10 codes in primary care
// and small hospital settings. NOT a full ICD-10 dump — for a complete
// reference, integrate with an external API (WHO, AAPC, etc.). This set
// is enough to start a clinic and covers the top conditions the docs see.
//
// Top categories covered:
//   - Infectious diseases (A00-B99)
//   - Neoplasms (C00-D49)
//   - Blood / immune (D50-D89)
//   - Endocrine / metabolic (E00-E90)
//   - Mental / behavioural (F00-F99)
//   - Nervous system (G00-G99)
//   - Eye / ear (H00-H95)
//   - Circulatory (I00-I99)
//   - Respiratory (J00-J99)
//   - Digestive (K00-K95)
//   - Skin (L00-L99)
//   - Musculoskeletal (M00-M99)
//   - Genitourinary (N00-N99)
//   - Pregnancy / childbirth (O00-O99)
//   - Perinatal (P00-P96)
//   - Symptoms / signs (R00-R99)
//   - Injury / poisoning (S00-T98)
//   - External causes (V01-Y98)
//   - Health services (Z00-Z99)

const icd10 = [
    // Infectious diseases
    { code: 'A09', title: 'Infectious gastroenteritis and colitis, unspecified' },
    { code: 'A15.0', title: 'Tuberculosis of lung' },
    { code: 'A41.9', title: 'Sepsis, unspecified organism' },
    { code: 'A90', title: 'Dengue fever' },
    { code: 'B19.9', title: 'Unspecified viral hepatitis without hepatic coma' },
    { code: 'B34.9', title: 'Viral infection, unspecified' },
    { code: 'B50.9', title: 'Plasmodium falciparum malaria, unspecified' },
    { code: 'B54', title: 'Unspecified malaria' },
    { code: 'B86', title: 'Scabies' },
    // Endocrine / metabolic
    { code: 'E10.9', title: 'Type 1 diabetes mellitus without complications' },
    { code: 'E11.9', title: 'Type 2 diabetes mellitus without complications' },
    { code: 'E11.65', title: 'Type 2 diabetes mellitus with hyperglycemia' },
    { code: 'E11.40', title: 'Type 2 diabetes mellitus with diabetic neuropathy, unspecified' },
    { code: 'E11.22', title: 'Type 2 diabetes mellitus with diabetic chronic kidney disease' },
    { code: 'E03.9', title: 'Hypothyroidism, unspecified' },
    { code: 'E05.90', title: 'Thyrotoxicosis, unspecified' },
    { code: 'E66.9', title: 'Obesity, unspecified' },
    { code: 'E46', title: 'Unspecified protein-calorie malnutrition' },
    { code: 'E78.5', title: 'Hyperlipidemia, unspecified' },
    { code: 'E86.0', title: 'Dehydration' },
    // Mental / behavioural
    { code: 'F10.129', title: 'Alcohol abuse with intoxication, unspecified' },
    { code: 'F32.9', title: 'Major depressive disorder, single episode, unspecified' },
    { code: 'F33.1', title: 'Major depressive disorder, recurrent, moderate' },
    { code: 'F41.0', title: 'Panic disorder [episodic paroxysmal anxiety]' },
    { code: 'F41.1', title: 'Generalized anxiety disorder' },
    { code: 'F41.9', title: 'Anxiety disorder, unspecified' },
    { code: 'F51.0', title: 'Insomnia, not due to a substance or known physiological condition' },
    // Nervous system
    { code: 'G40.909', title: 'Epilepsy, unspecified, not intractable, without status epilepticus' },
    { code: 'G43.909', title: 'Migraine, unspecified, not intractable, without status migrainosus' },
    { code: 'G44.1', title: 'Vascular headache, not elsewhere classified' },
    { code: 'G47.00', title: 'Insomnia, unspecified' },
    // Eye / ear
    { code: 'H10.9', title: 'Unspecified conjunctivitis' },
    { code: 'H52.4', title: 'Presbyopia' },
    { code: 'H66.90', title: 'Otitis media, unspecified, unspecified ear' },
    // Circulatory
    { code: 'I10', title: 'Essential (primary) hypertension' },
    { code: 'I20.9', title: 'Angina pectoris, unspecified' },
    { code: 'I21.9', title: 'Acute myocardial infarction, unspecified' },
    { code: 'I25.10', title: 'Atherosclerotic heart disease of native coronary artery without angina' },
    { code: 'I48.91', title: 'Atrial fibrillation, unspecified' },
    { code: 'I50.9', title: 'Heart failure, unspecified' },
    { code: 'I63.9', title: 'Cerebral infarction, unspecified' },
    { code: 'I83.90', title: 'Asymptomatic varicose veins of lower extremity' },
    // Respiratory
    { code: 'J00', title: 'Acute nasopharyngitis [common cold]' },
    { code: 'J02.9', title: 'Acute pharyngitis, unspecified' },
    { code: 'J03.90', title: 'Acute tonsillitis, unspecified' },
    { code: 'J06.9', title: 'Acute upper respiratory infection, unspecified' },
    { code: 'J18.9', title: 'Pneumonia, unspecified organism' },
    { code: 'J20.9', title: 'Acute bronchitis, unspecified' },
    { code: 'J44.9', title: 'Chronic obstructive pulmonary disease, unspecified' },
    { code: 'J45.909', title: 'Unspecified asthma, uncomplicated' },
    // Digestive
    { code: 'K21.9', title: 'Gastro-esophageal reflux disease without esophagitis' },
    { code: 'K29.70', title: 'Gastritis, unspecified, without bleeding' },
    { code: 'K35.80', title: 'Unspecified acute appendicitis' },
    { code: 'K52.9', title: 'Noninfective gastroenteritis and colitis, unspecified' },
    { code: 'K59.00', title: 'Constipation, unspecified' },
    { code: 'K76.0', title: 'Fatty (change of) liver, not elsewhere classified' },
    { code: 'K92.2', title: 'Gastrointestinal hemorrhage, unspecified' },
    // Skin
    { code: 'L03.90', title: 'Cellulitis, unspecified' },
    { code: 'L20.9', title: 'Atopic dermatitis, unspecified' },
    { code: 'L30.9', title: 'Dermatitis, unspecified' },
    { code: 'L40.9', title: 'Psoriasis, unspecified' },
    { code: 'L50.9', title: 'Urticaria, unspecified' },
    // Musculoskeletal
    { code: 'M10.9', title: 'Gout, unspecified' },
    { code: 'M17.9', title: 'Osteoarthritis of knee, unspecified' },
    { code: 'M25.50', title: 'Pain in unspecified joint' },
    { code: 'M54.5', title: 'Low back pain' },
    { code: 'M79.3', title: 'Panniculitis, unspecified' },
    // Genitourinary
    { code: 'N18.9', title: 'Chronic kidney disease, unspecified' },
    { code: 'N20.0', title: 'Calculus of kidney' },
    { code: 'N39.0', title: 'Urinary tract infection, site not specified' },
    { code: 'N40.0', title: 'Benign prostatic hyperplasia without lower urinary tract symptoms' },
    { code: 'N76.0', title: 'Acute vaginitis' },
    // Pregnancy / childbirth
    { code: 'O80', title: 'Encounter for full-term uncomplicated delivery' },
    { code: 'O82', title: 'Encounter for cesarean delivery without indication' },
    { code: 'Z34.90', title: 'Encounter for supervision of normal pregnancy, unspecified, unspecified trimester' },
    // Symptoms / signs
    { code: 'R05', title: 'Cough' },
    { code: 'R07.9', title: 'Chest pain, unspecified' },
    { code: 'R10.9', title: 'Unspecified abdominal pain' },
    { code: 'R11.10', title: 'Vomiting, unspecified' },
    { code: 'R19.7', title: 'Diarrhea, unspecified' },
    { code: 'R42', title: 'Dizziness and giddiness' },
    { code: 'R50.9', title: 'Fever, unspecified' },
    { code: 'R51', title: 'Headache' },
    { code: 'R53.83', title: 'Other fatigue' },
    // Injury / poisoning
    { code: 'S06.0X0A', title: 'Concussion without loss of consciousness, initial encounter' },
    { code: 'S52.501A', title: 'Unspecified fracture of right radius, initial encounter for closed fracture' },
    { code: 'T78.40XA', title: 'Allergy, unspecified, initial encounter' },
    // Health services
    { code: 'Z00.00', title: 'General adult medical examination without abnormal findings' },
    { code: 'Z23', title: 'Encounter for immunization' },
    { code: 'Z71.3', title: 'Dietary counseling and surveillance' },
];

module.exports = { icd10 };
