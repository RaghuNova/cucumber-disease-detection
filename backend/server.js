const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const PDFDocument = require('pdfkit');
const { GoogleGenerativeAI } = require('@google/generative-ai');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const app = express();
const PORT = 5000;
const logger = { info: console.log, warn: console.warn, error: console.error };

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, './uploads/'),
  filename: (_req, file, cb) => {
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`);
  },
});
const upload = multer({ storage });

// ─── Detailed fallback data per disease ─────────────────────────────────────

const DISEASE_DATA = {
  Not_Cucumber_Leaf: {
    ai_explanation: {
      root_cause: "The uploaded image does not match the visual patterns of cucumber leaves used in the trained dataset. This can happen when the image contains a different plant species, non-leaf object, heavy blur, low light, or a cropped region without clear cucumber leaf features.",
      symptoms: "Model signals are ambiguous for cucumber classes. The texture, venation, shape, and color distribution do not align strongly with known cucumber leaf disease patterns. This result indicates input mismatch rather than a confirmed cucumber diagnosis.",
      prevention: "Before analysis: (1) Upload only cucumber leaf images. (2) Capture a single clear leaf in daylight. (3) Keep the full leaf visible, including veins and margins. (4) Avoid shadows, blur, and cluttered backgrounds. (5) Use close-up shots with good focus.",
      early_detection: "If you suspect disease, re-capture the image with better clarity and confirm that the plant is cucumber. Take 2-3 photos from different angles (front and back of leaf) and re-run analysis for consistency.",
      farmer_loss: "No disease estimate is provided because the sample is outside the trained cucumber domain. Economic impact cannot be calculated from this image.",
      treatment: "No treatment recommendation is generated for non-cucumber inputs. Please upload a valid cucumber leaf image for disease-specific guidance.",
    },
    metrics: { severity: 0, spread_risk: 0, treatment_urgency: 0, recovery_chance: 0, yield_impact: 0 }
  },

  Healthy_leaves: {
    ai_explanation: {
      root_cause: "No disease detected — the cucumber leaf appears healthy with normal green coloration, intact cell structure, and no visible signs of fungal, bacterial, or viral infection. The plant is receiving adequate nutrients, water, and sunlight for proper photosynthesis.",
      symptoms: "The leaf shows uniform green color, smooth surface texture, well-defined veins, and no spots, lesions, yellowing, or wilting. This is the expected appearance of a well-maintained cucumber plant.",
      prevention: "To maintain healthy leaves: (1) Water consistently at the base, avoiding overhead irrigation which promotes fungal growth. (2) Maintain proper plant spacing of 12-18 inches for adequate air circulation. (3) Apply balanced NPK fertilizer every 2-3 weeks. (4) Rotate crops annually — avoid planting cucurbits in the same soil for at least 2 years. (5) Remove weeds that compete for nutrients. (6) Monitor humidity levels and keep greenhouse humidity below 85%.",
      early_detection: "Continue inspecting leaves 2-3 times per week. Look for: yellowing at leaf margins, small water-soaked spots, white powdery residue on leaf surfaces, or curling/wilting patterns. Early detection of any of these signs can prevent disease spread to the entire crop.",
      farmer_loss: "No economic loss expected. Healthy cucumber plants typically yield 10-20 fruits per plant over the growing season, worth approximately $3-5 per plant at market rates. Maintaining this health status protects your full revenue potential.",
      treatment: "No treatment is necessary. Continue your current maintenance routine: regular watering (1-2 inches per week), balanced fertilization, proper pruning of lower leaves to improve airflow, and monitoring for early signs of pest or disease pressure."
    },
    metrics: { severity: 0, spread_risk: 5, treatment_urgency: 0, recovery_chance: 100, yield_impact: 0 }
  },

  Downy_mildew: {
    ai_explanation: {
      root_cause: "Downy mildew in cucumbers is caused by the oomycete pathogen Pseudoperonospora cubensis. This water mold thrives in cool, moist conditions (15-22°C / 59-72°F) with high relative humidity above 85%. The pathogen spreads through airborne sporangia that travel hundreds of miles on wind currents. Infection occurs when spores land on wet leaf surfaces and germinate within 2-4 hours. The pathogen penetrates through stomata on the leaf underside and colonizes the internal tissue, destroying chloroplasts and disrupting photosynthesis. Outbreaks are most severe during cool nights followed by warm, humid days with morning dew.",
      symptoms: "Initial symptoms appear as small, angular, pale-green to yellow spots on the upper leaf surface, bounded by leaf veins (giving a mosaic-like appearance). On the leaf underside, a grayish-purple to dark brown fuzzy growth of sporangia appears — this is the hallmark diagnostic sign. As the disease progresses, lesions enlarge and merge, turning brown and necrotic. Severely affected leaves curl upward, become brittle, and eventually die. The disease typically starts on older, lower leaves and progresses upward through the canopy.",
      prevention: "Critical prevention steps: (1) Select resistant varieties — look for cucumber cultivars with DMR (Downy Mildew Resistance) gene markers such as 'Bristol', 'Citadel', or 'SV4719CS'. (2) Avoid overhead irrigation entirely — use drip irrigation to keep foliage dry. (3) Space plants generously (18-24 inches) for air circulation. (4) Apply preventive fungicides on a 7-10 day schedule during high-risk periods: Chlorothalonil, Mancozeb, or copper-based sprays BEFORE symptoms appear. (5) Remove and destroy crop debris after harvest — never compost infected material. (6) In greenhouses, maintain humidity below 80% using fans and ventilation. (7) Scout fields downwind of known infection sources.",
      early_detection: "Check the UNDERSIDE of leaves — this is where downy mildew shows first. Look for: (1) Faint yellow-green angular patches on the upper surface, often mistaken for nutrient deficiency. (2) Gray-purple fuzzy sporulation on the corresponding underside area, especially visible in early morning when humidity is highest. (3) Use a hand lens (10x) to confirm presence of branching sporangiophores. (4) Monitor weather — after 2+ consecutive nights with temperatures 15-20°C and >6 hours of leaf wetness, infection risk is extremely high. Act within 24-48 hours of spotting first symptoms.",
      farmer_loss: "Downy mildew can cause devastating losses of 30-100% of the cucumber crop if left untreated. Yield reductions typically range from 40-70% in moderate outbreaks. Infected plants produce fewer, smaller, and lower-quality fruits. In severe cases, entire fields can be lost within 7-14 days as the disease spreads explosively. Economic impact for a typical 1-acre cucumber farm: potential revenue loss of $5,000-$15,000 per season. Additionally, repeated infections force increased fungicide costs ($200-500 per acre per season) and may render fields unsuitable for cucurbit cultivation for 1-2 seasons.",
      treatment: "Immediate action plan: (1) REMOVE severely infected leaves immediately — bag and dispose of them away from the field, never compost. (2) Apply systemic fungicides immediately: Metalaxyl (Ridomil Gold) at 2.5 lb/acre, or Fluopicolide (Presidio) at 3-4 fl oz/acre, or Propamocarb (Previcur Flex) at 1.2 pt/acre. (3) Tank-mix systemic with contact fungicide (Mancozeb or Chlorothalonil) for dual-action protection. (4) Rotate fungicide FRAC groups to prevent resistance — never use the same group twice consecutively. (5) Reapply every 5-7 days during active infection. (6) Reduce irrigation frequency but maintain soil moisture. (7) For organic growers: apply copper hydroxide (2-3 lb/acre) + neem oil, combined with aggressive removal of infected tissue. (8) After harvest, thoroughly clean the field and practice 2-year crop rotation away from all cucurbits."
    },
    metrics: { severity: 82, spread_risk: 90, treatment_urgency: 88, recovery_chance: 45, yield_impact: 65 }
  },

  Powdery_mildew: {
    ai_explanation: {
      root_cause: "Powdery mildew on cucumbers is caused by the obligate fungal pathogens Podosphaera xanthii (formerly Sphaerotheca fuliginea) and Erysiphe cichoracearum. Unlike downy mildew, this disease thrives in warm, dry conditions (20-30°C / 68-86°F) with moderate humidity (50-70%). The fungus does NOT need free water on leaves for infection — high relative humidity is sufficient. Spores are dispersed by wind and can germinate within 4-8 hours of landing on a leaf surface. The fungus grows entirely on the leaf surface, sending feeding structures (haustoria) into epidermal cells to extract nutrients. Overcrowded plantings with poor air circulation, excessive nitrogen fertilization, and shaded conditions significantly increase susceptibility.",
      symptoms: "The first visible sign is small, circular, white powdery spots on the upper leaf surface — these feel talc-like when touched. The spots expand and merge, eventually covering the entire leaf with a white-to-gray powdery coating. Affected leaves turn yellow, then brown, curl upward, and become dry and brittle. Unlike downy mildew, powdery mildew predominantly affects the upper leaf surface (adaxial side) and may also spread to stems, petioles, and even fruit surfaces. Severely infected plants show stunted growth, reduced fruit set, and sunburned fruit due to loss of leaf canopy protection.",
      prevention: "Essential prevention measures: (1) Choose resistant varieties — look for PM (Powdery Mildew) resistance ratings. Varieties like 'Marketmore 76', 'Diva', and 'Tasty Green' have good resistance. (2) Maintain proper plant spacing of 18+ inches to promote airflow. (3) Avoid excessive nitrogen fertilization — high nitrogen promotes lush, susceptible growth. Use balanced NPK ratios. (4) Apply preventive treatments: potassium bicarbonate (Kaligreen) at 2.5-3 lb/acre or sulfur-based fungicides every 10-14 days starting at first flower. (5) Prune lower leaves and remove suckers to improve air circulation. (6) Water in the morning so foliage dries by afternoon. (7) In greenhouses, use horizontal airflow fans and maintain daytime humidity below 70%. (8) Consider biological controls: Bacillus subtilis (Serenade) or Bacillus amyloliquefaciens as preventive sprays.",
      early_detection: "Scout actively during warm, humid weather: (1) Inspect the UPPER surface of mature (lower canopy) leaves first — powdery mildew typically starts there. (2) Look for tiny white circular colonies 3-5mm in diameter — these are easy to miss if you don't look closely. (3) Rub a suspect spot with your finger — powdery mildew wipes off like chalk dust. (4) Check the underside of leaves too, especially along veins, as some strains start there. (5) Peak infection risk occurs when nights are cool (15-20°C) and days are warm (25-30°C) with relative humidity above 50%. (6) If you find even ONE colony, treat immediately — the disease can cover an entire plant within 7-10 days.",
      farmer_loss: "Powdery mildew typically causes moderate-to-severe crop losses of 20-50% in untreated fields. Yield reduction occurs through reduced photosynthesis (leaf coverage), premature defoliation, smaller fruit size, and reduced fruit quality (blemished/sunburned skin). Economic impact: potential revenue loss of $3,000-$8,000 per acre per season. Fruit with visible mildew or sunburn damage may be downgraded or rejected at market, reducing per-unit revenue by 30-50%. However, because powdery mildew progresses more slowly than downy mildew, early intervention can limit losses to under 15%.",
      treatment: "Step-by-step treatment protocol: (1) Remove the most heavily infected leaves (more than 50% covered) — seal in bags and dispose away from the field. (2) Apply fungicides immediately — best options: Myclobutanil (Rally) at 5 oz/acre (systemic, curative), or Triflumizole (Procure) at 8 oz/acre, or Flutriafol + Chlorothalonil combination spray. (3) For organic growers: apply sulfur (micronized wettable sulfur at 3-5 lb/acre) — DO NOT apply when temperatures exceed 32°C/90°F as it can cause leaf burn. Alternatively, spray potassium bicarbonate (1 tablespoon per gallon) or milk solution (40% milk to water). Neem oil (0.5-1%) is also effective as both treatment and preventive. (4) Reapply every 7-10 days, rotating between FRAC groups 3, 7, and 11 to prevent resistance. (5) Improve ventilation: thin canopy, stake or trellis plants vertically. (6) Reduce nitrogen application by 20-30% until disease is controlled. (7) Biological option: spray Bacillus subtilis every 5-7 days as a supplement to chemical treatment."
    },
    metrics: { severity: 58, spread_risk: 70, treatment_urgency: 65, recovery_chance: 68, yield_impact: 40 }
  }
};

// ─── Farmer feature fallback data ────────────────────────────────────────────

const FARMER_FALLBACK = {
  Downy_mildew: {
    crop_loss: {
      min: 30, max: 70,
      explanation: 'Downy mildew spreads very fast in humid weather. If not treated early, it can destroy 30 to 70% of your cucumber crop.',
    },
    india_advice: {
      root_cause: 'In Indian farms, downy mildew commonly appears during monsoon season (June–September) when humidity is very high, above 85%. Cool nights followed by warm days create ideal conditions for this disease.',
      when: 'Most common during June to September (monsoon). In some areas it also appears in January–February with heavy morning dew.',
      prevention: '1. Water only at the base of plants, not on leaves.\n2. Keep plants 18–24 inches apart for good airflow.\n3. Apply copper-based fungicide before monsoon starts.\n4. Use resistant varieties like "Bristol" or "Citadel".',
      treatment: '1. Remove all infected leaves and dispose far from your farm.\n2. Spray Metalaxyl or Chlorothalonil fungicide immediately.\n3. Reduce watering frequency.\n4. Re-spray every 5–7 days until the disease stops.',
    },
    ignored_timeline: {
      week1: 'Yellow-green spots grow bigger on leaves. Disease starts spreading to nearby plants through wind.',
      week2: 'Leaves turn brown and dry out. Fewer flowers appear and fruits become smaller.',
      week3: 'Plants become very weak. Most fruits stop growing. Disease spreads to the whole farm.',
      final_loss: '30–70% crop loss is expected if disease is completely ignored for 3 weeks.',
    },
    urgency_explanation: 'Downy mildew spreads very fast in humid weather. Every day without treatment means more plants get infected. Act immediately to save your crop.',
  },
  Powdery_mildew: {
    crop_loss: {
      min: 20, max: 50,
      explanation: 'Powdery mildew weakens plants slowly and can cause 20 to 50% yield loss by making fruits smaller and reducing production.',
    },
    india_advice: {
      root_cause: 'In Indian farms, powdery mildew is common in warm, dry weather (25–30°C) with moderate humidity. It often appears after monsoon when days are warm but drier.',
      when: 'Most common in April–June (summer) and October–November (post-monsoon). Can appear any time temperature stays between 25–30°C.',
      prevention: '1. Space plants at least 18 inches apart for good airflow.\n2. Do not use too much nitrogen fertilizer.\n3. Apply sulfur-based fungicide every 10–14 days.\n4. Water plants in the morning so leaves dry before evening.',
      treatment: '1. Remove leaves that are more than 50% covered in white powder.\n2. Spray Myclobutanil or wettable sulfur fungicide immediately.\n3. For organic treatment: spray neem oil or baking soda solution.\n4. Repeat spray every 7–10 days, alternating different fungicides.',
    },
    ignored_timeline: {
      week1: 'White powdery spots grow and spread to more leaves. Leaf edges start turning yellow.',
      week2: 'Leaves curl and become dry. Plant growth slows and fruit size reduces.',
      week3: 'Most leaves are covered in white powder. Fruits get sunburned due to lack of leaf cover.',
      final_loss: '20–50% yield loss expected if untreated for 3 weeks. Market value of fruits also drops.',
    },
    urgency_explanation: 'Powdery mildew spreads through wind and can quickly cover the whole farm. Treating early can save 50–80% of the remaining crop.',
  },
  Healthy_leaves: {
    crop_loss: {
      min: 0, max: 0,
      explanation: 'Your crop is healthy! No disease detected. Continue your current care routine to maintain zero crop loss.',
    },
    india_advice: {
      root_cause: 'Your cucumber plant is healthy. No disease has been found. Your current farming practices are working well.',
      when: 'Keep monitoring your crop twice a week. Be extra careful before and during monsoon season (May–June).',
      prevention: '1. Water only at the base of plants, never from above.\n2. Maintain proper spacing between plants.\n3. Apply balanced NPK fertilizer every 2–3 weeks.\n4. Remove weeds regularly.',
      treatment: 'No treatment needed. Your plant is healthy. Just continue your regular care routine and keep monitoring.',
    },
    ignored_timeline: {
      week1: 'Plant remains healthy with regular care and monitoring.',
      week2: 'Without proper monitoring, early disease signs might be missed.',
      week3: 'Lack of attention can allow small issues to grow into bigger problems.',
      final_loss: 'No crop loss expected if you continue regular care and monitoring.',
    },
    urgency_explanation: 'No treatment needed — your plant is healthy! Keep monitoring your crop regularly to catch any early signs of disease.',
  },
  Not_Cucumber_Leaf: {
    crop_loss: {
      min: 0, max: 0,
      explanation: 'Cannot estimate crop loss — the uploaded image does not appear to be a cucumber leaf.',
    },
    india_advice: {
      root_cause: 'The uploaded image was not recognized as a cucumber leaf.',
      when: 'Please upload a clear, close-up photo of a cucumber leaf for accurate results.',
      prevention: 'Ensure good lighting and the leaf fills most of the frame when photographing.',
      treatment: 'No treatment recommendation — please re-upload a valid cucumber leaf image.',
    },
    ignored_timeline: {
      week1: 'Cannot analyze — image not recognized as cucumber leaf.',
      week2: 'Please upload a valid cucumber leaf image.',
      week3: 'No timeline data available for non-cucumber images.',
      final_loss: 'Cannot estimate — please re-upload a valid cucumber leaf image.',
    },
    urgency_explanation: 'Cannot determine urgency — the uploaded image does not appear to be a cucumber leaf. Please try again with a proper photo.',
  },
};

function getUrgencyLevel(confidence, disease) {
  if (!disease || disease === 'Not_Cucumber_Leaf') return 'UNKNOWN';
  if (disease === 'Healthy_leaves') return 'NONE';
  if (confidence < 60) return 'LOW';
  if (confidence < 80) return 'MEDIUM';
  if (confidence < 90) return 'HIGH';
  return 'CRITICAL';
}

// ─── Kannada voice fallback (clean 3-line text per disease) ──────────────────

const KANNADA_FALLBACK = {
  Downy_mildew:
    'ಎಲೆಗಳ ಮೇಲೆ ಹೆಚ್ಚು ತೇವಾಂಶದಿಂದ ಈ ರೋಗ ಬರುತ್ತದೆ.\nತಕ್ಷಣ ಫಂಗಿಸೈಡ್ ಔಷಧ ಸಿಂಪಡಿಸಿ.\nಚಿಕಿತ್ಸೆ ಮಾಡದಿದ್ದರೆ ೩೦ ರಿಂದ ೭೦ ಪ್ರತಿಶತ ಬೆಳೆ ನಷ್ಟವಾಗಬಹುದು.',
  Powdery_mildew:
    'ಬಿಸಿಲಿನ ಹವೆಯಲ್ಲಿ ಶಿಲೀಂಧ್ರದಿಂದ ಈ ರೋಗ ಉಂಟಾಗುತ್ತದೆ.\nಗಂಧಕ ಅಥವಾ ನೀಮ್ ಎಣ್ಣೆ ಸಿಂಪಡಿಸಿ.\nಚಿಕಿತ್ಸೆ ಮಾಡದಿದ್ದರೆ ೨೦ ರಿಂದ ೫೦ ಪ್ರತಿಶತ ಬೆಳೆ ಹಾಳಾಗಬಹುದು.',
  Healthy_leaves:
    'ನಿಮ್ಮ ಸೌತೆಕಾಯಿ ಎಲೆ ಆರೋಗ್ಯಕರವಾಗಿದೆ.\nಯಾವುದೇ ಚಿಕಿತ್ಸೆ ಅಗತ್ಯವಿಲ್ಲ, ಆದರೆ ನಿಯಮಿತವಾಗಿ ಗಮನಿಸಿ.\nಸರಿಯಾದ ನೀರಾವರಿ ಮತ್ತು ಗೊಬ್ಬರ ನೀಡಿ.',
  Not_Cucumber_Leaf:
    'ಈ ಚಿತ್ರ ಸೌತೆಕಾಯಿ ಎಲೆಯಲ್ಲ.\nದಯವಿಟ್ಟು ಸ್ಪಷ್ಟವಾದ ಸೌತೆಕಾಯಿ ಎಲೆಯ ಚಿತ್ರ ಅಪ್‌ಲೋಡ್ ಮಾಡಿ.\nರೋಗ ಮಾಹಿತಿ ಲಭ್ಯವಿಲ್ಲ.',
};

function _isValidKannada(text) {
  if (!text || typeof text !== 'string') return false;
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length !== 3) return false;
  // Reject if any line has ASCII letters (English words)
  if (/[a-zA-Z]{3,}/.test(text)) return false;
  // Must contain at least some Kannada Unicode range (\u0C80-\u0CFF)
  if (!/[\u0C80-\u0CFF]/.test(text)) return false;
  return true;
}

async function getKannadaVoiceText(disease) {
  const apiKey = process.env.GEMINI_API_KEY;
  const fallback = KANNADA_FALLBACK[disease] || KANNADA_FALLBACK['Healthy_leaves'];

  if (!apiKey || apiKey === 'YOUR_API_KEY_HERE') return fallback;
  if (disease === 'Not_Cucumber_Leaf') return KANNADA_FALLBACK['Not_Cucumber_Leaf'];

  const diseaseName = disease.replace(/_/g, ' ');

  const prompt = `Generate Kannada voice advice for cucumber disease: ${diseaseName}

Strict rules:
1. Output must be ONLY Kannada script. No English words at all.
2. Output must contain exactly 3 lines.
3. Line 1 = one short sentence about the cause of this disease.
4. Line 2 = one short sentence about what treatment to do immediately.
5. Line 3 = one short sentence about how much crop loss if untreated.
6. Use very simple everyday Kannada words that a farmer can understand.
7. Do NOT include headings, labels, numbers, bullet points, or symbols.
8. Do NOT include any explanation or extra text.
9. Each line must be one sentence only.
10. Output nothing except these 3 Kannada lines separated by newlines.`;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const gModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const gResult = await gModel.generateContent(prompt);
    let raw = gResult.response.text().trim();
    // Strip any markdown code fences
    raw = raw.replace(/```[\s\S]*?```/g, '').replace(/`/g, '').trim();
    // Normalize line endings and remove blank lines
    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const cleaned = lines.slice(0, 3).join('\n');
    if (_isValidKannada(cleaned)) {
      logger.info('Kannada voice text generated via Gemini');
      return cleaned;
    }
    logger.warn('Kannada validation failed, using fallback. Got: ' + raw.substring(0, 80));
    return fallback;
  } catch (err) {
    logger.error('Kannada voice Gemini error: ' + err.message);
    return fallback;
  }
}

// ─── Gemini integration ─────────────────────────────────────────────────────

async function getGeminiExplanation(disease, confidence) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'YOUR_API_KEY_HERE') {
    throw new Error('GEMINI_API_KEY not configured');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const diseaseName = disease.replace(/_/g, ' ');

  const prompt = `You are a senior agricultural plant pathologist and crop disease expert with 20+ years of experience helping cucumber farmers. A cucumber leaf has been analyzed by a CNN deep learning model and the following disease was detected:

Disease: ${diseaseName}
Confidence: ${confidence}%

Provide an extremely detailed, scientifically accurate, and practically useful analysis. Write as if you are advising a real farmer who needs actionable guidance to save their crop RIGHT NOW.

Return a JSON object with these exact keys:

{
  "root_cause": "Provide 4-6 sentences. Include: the specific pathogen name (scientific and common), the biological mechanism of infection, what environmental conditions trigger it (temperature, humidity, rainfall), how the pathogen spreads (wind, water, soil, insects), and why this particular crop is vulnerable. Be scientifically accurate.",
  
  "symptoms": "Provide 4-6 sentences describing what the farmer should visually see on the leaf and plant. Include: early-stage vs advanced symptoms, which part of the leaf is affected first (upper/lower surface), color changes, texture changes, pattern (angular vs circular spots), and how to distinguish this disease from similar-looking conditions.",
  
  "prevention": "Provide 6-8 specific, numbered prevention steps a farmer should follow. Include: resistant variety names, irrigation best practices, spacing recommendations, crop rotation guidelines, preventive fungicide schedule with product names and rates, environmental management (ventilation, humidity), and hygiene practices.",
  
  "early_detection": "Provide 4-5 sentences on how to catch this disease in its earliest stages before it spreads. Include: what to look for, where on the plant to check, what time of day is best for inspection, weather conditions that signal high risk, and how quickly they must act after first symptoms.",
  
  "farmer_loss": "Provide 3-4 sentences on the economic reality. Include: typical yield loss percentage range, revenue impact per acre, effect on fruit quality and market price, how quickly losses escalate without treatment, and comparison of treated vs untreated scenarios.",
  
  "treatment": "Provide 6-8 specific, numbered treatment steps for IMMEDIATE action. Include: which infected leaves to remove, specific fungicide names with application rates and frequency, organic alternatives (neem oil, copper, sulfur, biological agents) with rates, fungicide rotation strategy (FRAC groups), cultural practices to implement during treatment, and post-treatment monitoring schedule.",
  
  "severity": A number from 0-100 indicating disease severity,
  "spread_risk": A number from 0-100 indicating how fast this spreads,
  "treatment_urgency": A number from 0-100 indicating how urgently treatment is needed,
  "recovery_chance": A number from 0-100 indicating chance of crop recovery with treatment,
  "yield_impact": A number from 0-100 indicating expected yield loss percentage
}

Respond ONLY with valid JSON. No markdown formatting, no code blocks, no backticks. Just the raw JSON object.`;

  const result = await model.generateContent(prompt);
  let text = result.response.text().trim();

  // Strip code fences if present
  text = text.replace(/```json\s*/gi, '').replace(/```/g, '').trim();

  const parsed = JSON.parse(text);
  return parsed;
}

function cleanupFile(filePath) {
  fs.unlink(filePath, (err) => {
    if (err) console.error(`Cleanup failed ${filePath}:`, err.message);
  });
}

// ─── Routes ─────────────────────────────────────────────────────────────────

app.post('/api/predict', upload.single('image'), async (req, res) => {
  let uploadedFilePath = null;

  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No image file provided' });
    }

    uploadedFilePath = req.file.path;

    const form = new FormData();
    form.append('file', fs.createReadStream(uploadedFilePath), {
      filename: req.file.originalname,
      contentType: req.file.mimetype,
    });

    let mlResponse;
    try {
      mlResponse = await axios.post('http://localhost:8000/predict', form, {
        headers: form.getHeaders(),
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });
    } catch (err) {
      if (err.code === 'ECONNREFUSED') {
        return res.status(503).json({
          success: false,
          error: 'ML prediction service is not running. Please start the Python API server (uvicorn app:app --port 8000).',
        });
      }
      throw err;
    }

    const {
      disease,
      confidence,
      all_predictions,
      is_cucumber_leaf,
      message,
    } = mlResponse.data;

    // Get AI explanation — try Gemini first, fall back to detailed local data
    let ai_explanation, metrics;
    const fallback = DISEASE_DATA[disease] || DISEASE_DATA['Healthy_leaves'];

    if (disease === 'Healthy_leaves' || disease === 'Not_Cucumber_Leaf') {
      ai_explanation = fallback.ai_explanation;
      metrics = fallback.metrics;
    } else {
      try {
        const geminiResult = await getGeminiExplanation(disease, confidence);
        // Extract metrics from Gemini response
        metrics = {
          severity: geminiResult.severity ?? fallback.metrics.severity,
          spread_risk: geminiResult.spread_risk ?? fallback.metrics.spread_risk,
          treatment_urgency: geminiResult.treatment_urgency ?? fallback.metrics.treatment_urgency,
          recovery_chance: geminiResult.recovery_chance ?? fallback.metrics.recovery_chance,
          yield_impact: geminiResult.yield_impact ?? fallback.metrics.yield_impact,
        };
        // Extract text fields
        ai_explanation = {
          root_cause: geminiResult.root_cause,
          symptoms: geminiResult.symptoms,
          prevention: geminiResult.prevention,
          early_detection: geminiResult.early_detection,
          farmer_loss: geminiResult.farmer_loss,
          treatment: geminiResult.treatment,
        };
        console.log('Gemini explanation retrieved successfully');
      } catch (geminiErr) {
        console.error('Gemini API error:', geminiErr.message);
        console.log('Using detailed fallback explanations');
        ai_explanation = fallback.ai_explanation;
        metrics = fallback.metrics;
      }
    }

    // Generate dedicated Kannada voice text
    const voiceText = await getKannadaVoiceText(disease);

    return res.json({
      success: true,
      disease,
      confidence,
      all_predictions,
      is_cucumber_leaf,
      message,
      ai_explanation,
      metrics,
      voiceText,
    });
  } catch (err) {
    console.error('Prediction error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  } finally {
    if (uploadedFilePath) cleanupFile(uploadedFilePath);
  }
});

app.post('/api/report', async (req, res) => {
  try {
    const { disease, confidence, all_predictions, ai_explanation, metrics } = req.body;

    if (!disease) {
      return res.status(400).json({ success: false, error: 'Disease data is required' });
    }

    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=cucumber-disease-report.pdf');
    doc.pipe(res);

    const diseaseName = disease.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    // Title
    doc.fontSize(22).font('Helvetica-Bold').text('Cucumber Leaf Disease Detection Report', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica').fillColor('#666666')
      .text(`Generated: ${new Date().toLocaleString()} | Powered by Deep Learning & Google Gemini AI`, { align: 'center' });
    doc.fillColor('#000000');

    doc.moveDown(0.8);
    doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).lineWidth(0.5).stroke('#cccccc');
    doc.moveDown(0.8);

    // Detection summary
    doc.fontSize(16).font('Helvetica-Bold').fillColor('#1a4d2e').text('Detection Summary');
    doc.moveDown(0.4);
    doc.fontSize(12).font('Helvetica').fillColor('#333333');
    doc.text(`Disease Detected: ${diseaseName}`, { continued: false });
    doc.text(`Confidence Score: ${confidence}%`);
    if (metrics) {
      doc.text(`Severity Level: ${metrics.severity}/100`);
      doc.text(`Treatment Urgency: ${metrics.treatment_urgency}/100`);
      doc.text(`Recovery Chance: ${metrics.recovery_chance}%`);
      doc.text(`Expected Yield Impact: ${metrics.yield_impact}%`);
    }

    doc.moveDown(0.6);

    // Class probabilities
    if (all_predictions?.length > 0) {
      doc.fontSize(14).font('Helvetica-Bold').fillColor('#1a4d2e').text('Classification Probabilities');
      doc.moveDown(0.3);
      doc.fontSize(11).font('Helvetica').fillColor('#333333');
      all_predictions.forEach((p) => {
        const name = p.class.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        doc.text(`  • ${name}: ${p.confidence}%`);
      });
      doc.moveDown(0.6);
    }

    // AI Explanation sections
    if (ai_explanation) {
      const sections = [
        { key: 'root_cause', title: '🔬 Root Cause Analysis' },
        { key: 'symptoms', title: '🩺 Symptoms & Visual Indicators' },
        { key: 'prevention', title: '🛡️ Prevention Methods' },
        { key: 'early_detection', title: '🔍 Early Detection Guide' },
        { key: 'farmer_loss', title: '📉 Economic Impact Assessment' },
        { key: 'treatment', title: '💊 Treatment Protocol' },
      ];

      doc.fontSize(16).font('Helvetica-Bold').fillColor('#1a4d2e').text('Detailed AI Analysis');
      doc.moveDown(0.4);

      sections.forEach(({ key, title }) => {
        if (ai_explanation[key]) {
          doc.fontSize(12).font('Helvetica-Bold').fillColor('#2d6a4f').text(title);
          doc.moveDown(0.2);
          doc.fontSize(10).font('Helvetica').fillColor('#444444').text(ai_explanation[key], { lineGap: 2 });
          doc.moveDown(0.5);
        }
      });
    }

    // Footer
    doc.moveDown(1);
    doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).lineWidth(0.5).stroke('#cccccc');
    doc.moveDown(0.4);
    doc.fontSize(9).font('Helvetica-Oblique').fillColor('#999999')
      .text('Generated by CucumberGuard AI — AI-Based Cucumber Leaf Disease Detection System', { align: 'center' });
    doc.text('This report is for informational purposes. Consult a local agricultural expert for confirmation.', { align: 'center' });

    doc.end();
  } catch (err) {
    console.error('Report generation error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Farmer features endpoint ─────────────────────────────────────────────────

app.post('/api/farmer-features', async (req, res) => {
  const { disease, confidence } = req.body;
  if (!disease) return res.status(400).json({ success: false, error: 'Disease required' });

  const urgency_level = getUrgencyLevel(confidence, disease);
  const fallback = FARMER_FALLBACK[disease] || FARMER_FALLBACK['Healthy_leaves'];

  let crop_loss = { ...fallback.crop_loss };
  let india_advice = { ...fallback.india_advice };
  let ignored_timeline = { ...fallback.ignored_timeline };
  let urgency_explanation = fallback.urgency_explanation;
  // kannada_voice_text is now generated in /api/predict via getKannadaVoiceText()
  // but we keep a fallback here for standalone calls
  const kannada_voice_text = KANNADA_FALLBACK[disease] || KANNADA_FALLBACK['Healthy_leaves'];

  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey && apiKey !== 'YOUR_API_KEY_HERE' && disease !== 'Not_Cucumber_Leaf') {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const gModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const diseaseName = disease.replace(/_/g, ' ');

      const prompt = `You are an agricultural expert helping Indian cucumber farmers. Respond ONLY with valid JSON (no markdown, no code blocks, no backticks).
Disease: ${diseaseName}
Confidence: ${confidence}%
Urgency Level: ${urgency_level}

Required JSON:
{
  "crop_loss_min": number,
  "crop_loss_max": number,
  "crop_loss_explanation": "1-2 simple sentences",
  "india_root_cause": "1-2 sentences about why this occurs in Indian farms, mention monsoon/humidity/temperature",
  "india_when": "which season/months in India",
  "india_prevention": "3-4 numbered practical steps for Indian farmers",
  "india_treatment": "3-4 numbered immediate treatment steps",
  "week1": "1 sentence what happens in week 1 if ignored",
  "week2": "1 sentence what happens in week 2 if ignored",
  "week3": "1 sentence what happens in week 3 if ignored",
  "final_loss": "1 sentence total crop loss if completely ignored",
  "urgency_explanation": "2-3 simple sentences why urgency is ${urgency_level}"
}`;

      const gResult = await gModel.generateContent(prompt);
      let gText = gResult.response.text().trim().replace(/```json\s*/gi, '').replace(/```/g, '').trim();
      const p = JSON.parse(gText);

      crop_loss = {
        min: p.crop_loss_min ?? fallback.crop_loss.min,
        max: p.crop_loss_max ?? fallback.crop_loss.max,
        explanation: p.crop_loss_explanation ?? fallback.crop_loss.explanation,
      };
      india_advice = {
        root_cause: p.india_root_cause ?? fallback.india_advice.root_cause,
        when: p.india_when ?? fallback.india_advice.when,
        prevention: p.india_prevention ?? fallback.india_advice.prevention,
        treatment: p.india_treatment ?? fallback.india_advice.treatment,
      };
      ignored_timeline = {
        week1: p.week1 ?? fallback.ignored_timeline.week1,
        week2: p.week2 ?? fallback.ignored_timeline.week2,
        week3: p.week3 ?? fallback.ignored_timeline.week3,
        final_loss: p.final_loss ?? fallback.ignored_timeline.final_loss,
      };
      urgency_explanation = p.urgency_explanation ?? fallback.urgency_explanation;
    } catch (err) {
      console.error('Farmer features Gemini error:', err.message);
    }
  }

  return res.json({
    success: true,
    urgency_level,
    crop_loss,
    india_advice,
    ignored_timeline,
    urgency_explanation,
    kannada_voice_text,
  });
});

// ─── Translation endpoint ──────────────────────────────────────────────────────

app.post('/api/translate', async (req, res) => {
  const { texts, language } = req.body;
  if (!texts || language === 'en') return res.json({ success: true, translated: texts });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'YOUR_API_KEY_HERE') {
    return res.json({ success: false, translated: texts, error: 'Gemini API not configured' });
  }

  try {
    const langNames = { hi: 'Hindi', kn: 'Kannada' };
    const langName = langNames[language] || language;
    const genAI = new GoogleGenerativeAI(apiKey);
    const gModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const prompt = `Translate the following JSON object values into simple, farmer-friendly ${langName}. Keep the language easy to understand. Do not translate the JSON keys. Return ONLY valid JSON with the same keys but translated values. No markdown, no code blocks.
${JSON.stringify(texts)}`;

    const gResult = await gModel.generateContent(prompt);
    let gText = gResult.response.text().trim().replace(/```json\s*/gi, '').replace(/```/g, '').trim();
    const translated = JSON.parse(gText);
    return res.json({ success: true, translated });
  } catch (err) {
    console.error('Translation error:', err.message);
    return res.json({ success: false, translated: texts });
  }
});

// ─── Quick farmer report PDF ──────────────────────────────────────────────────

app.post('/api/quick-report', async (req, res) => {
  try {
    const { disease, confidence, urgency_level, crop_loss, india_advice, ignored_timeline, urgency_explanation } = req.body;
    if (!disease) return res.status(400).json({ success: false, error: 'Disease data required' });

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=Farmer-Quick-Report.pdf');
    doc.pipe(res);

    const diseaseName = disease.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const urgencyColors = { LOW: '#16A34A', MEDIUM: '#CA8A04', HIGH: '#EA580C', CRITICAL: '#DC2626', NONE: '#16A34A', UNKNOWN: '#9CA3AF' };
    const urgencyColor = urgencyColors[urgency_level] || '#9CA3AF';
    const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });

    // Header bar
    doc.rect(0, 0, doc.page.width, 70).fill('#1B4332');
    doc.fillColor('#FFFFFF').fontSize(20).font('Helvetica-Bold').text('CucumberGuard', 50, 14, { align: 'center' });
    doc.fontSize(10).font('Helvetica').text('Quick Farmer Disease Report', 50, 40, { align: 'center' });
    doc.fillColor('#000000');
    doc.moveDown(3);
    doc.fontSize(9).fillColor('#6B7280').text(`Report Date: ${dateStr}`, { align: 'right' });
    doc.moveDown(0.5);

    // Disease box
    const boxY = doc.y;
    doc.rect(50, boxY, doc.page.width - 100, 54).fill('#F0FDF4').stroke('#A7F3D0');
    doc.fillColor('#065F46').fontSize(10).font('Helvetica-Bold').text('DISEASE DETECTED', 65, boxY + 8);
    doc.fontSize(17).text(diseaseName, 65, boxY + 24);
    doc.fontSize(11).font('Helvetica').fillColor('#374151').text(`Confidence: ${confidence}%`, doc.page.width - 165, boxY + 26, { width: 115, align: 'right' });
    doc.fillColor('#000000');
    doc.y = boxY + 62;

    // Urgency
    doc.moveDown(0.5);
    doc.fontSize(13).font('Helvetica-Bold').fillColor('#1B4332').text('Treatment Urgency');
    doc.moveDown(0.3);
    const urgY = doc.y;
    doc.rect(50, urgY, 130, 28).fill(urgencyColor);
    doc.fillColor('#FFFFFF').fontSize(13).font('Helvetica-Bold').text(urgency_level || 'N/A', 50, urgY + 6, { width: 130, align: 'center' });
    doc.fillColor('#000000');
    doc.y = urgY + 36;
    doc.moveDown(0.2);
    if (urgency_explanation) {
      doc.fontSize(10).font('Helvetica').fillColor('#444444').text(urgency_explanation, { lineGap: 2 });
    }

    // Crop loss
    doc.moveDown(0.7);
    doc.fontSize(13).font('Helvetica-Bold').fillColor('#1B4332').text('Expected Crop Loss');
    doc.moveDown(0.2);
    if (crop_loss) {
      doc.fontSize(22).font('Helvetica-Bold').fillColor(crop_loss.min === 0 ? '#16A34A' : '#DC2626').text(`${crop_loss.min}% – ${crop_loss.max}%`);
      doc.moveDown(0.1);
      doc.fontSize(10).font('Helvetica').fillColor('#444444').text(crop_loss.explanation || '', { lineGap: 2 });
    }

    // Root cause + treatment
    if (india_advice) {
      doc.moveDown(0.7);
      doc.fontSize(13).font('Helvetica-Bold').fillColor('#1B4332').text('Root Cause');
      doc.moveDown(0.2);
      doc.fontSize(10).font('Helvetica').fillColor('#444444').text(india_advice.root_cause || '', { lineGap: 2 });
      doc.moveDown(0.7);
      doc.fontSize(13).font('Helvetica-Bold').fillColor('#1B4332').text('Treatment Steps');
      doc.moveDown(0.2);
      doc.fontSize(10).font('Helvetica').fillColor('#444444').text(india_advice.treatment || '', { lineGap: 2 });
    }

    // Ignored timeline
    if (ignored_timeline) {
      doc.moveDown(0.7);
      doc.fontSize(13).font('Helvetica-Bold').fillColor('#1B4332').text('What Happens If Ignored');
      doc.moveDown(0.2);
      doc.fontSize(10).font('Helvetica').fillColor('#444444');
      doc.text(`Week 1: ${ignored_timeline.week1 || ''}`);
      doc.text(`Week 2: ${ignored_timeline.week2 || ''}`);
      doc.text(`Week 3: ${ignored_timeline.week3 || ''}`);
      doc.moveDown(0.2);
      doc.font('Helvetica-Bold').fillColor('#DC2626').text(`Final Result: ${ignored_timeline.final_loss || ''}`);
    }

    // Footer
    doc.moveDown(2);
    doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).lineWidth(0.5).stroke('#D1D5DB');
    doc.moveDown(0.4);
    doc.fontSize(8).font('Helvetica-Oblique').fillColor('#9CA3AF').text('Generated by CucumberGuard AI · For educational purposes only · Consult a local agricultural expert for confirmation.', { align: 'center' });
    doc.end();
  } catch (err) {
    console.error('Quick report error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Kannada TTS proxy via Google Translate ────────────────────────────────
app.post('/api/speak', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'No text provided' });

  try {
    // Split by newline so each sentence stays within Google TTS char limit
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const buffers = [];

    for (const line of lines) {
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(line)}&tl=kn&client=tw-ob&ttsspeed=0.8`;
      const r = await axios.get(url, {
        responseType: 'arraybuffer',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://translate.google.com/',
        },
        timeout: 10000,
      });
      buffers.push(Buffer.from(r.data));
    }

    // Concatenated MP3 buffers play fine as a continuous audio stream
    res.set('Content-Type', 'audio/mpeg');
    res.send(Buffer.concat(buffers));
  } catch (err) {
    logger.error('TTS proxy error: ' + err.message);
    res.status(500).json({ error: 'TTS service unavailable' });
  }
});

app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === 'YOUR_API_KEY_HERE') {
    console.log('⚠️  GEMINI_API_KEY not set — using detailed fallback explanations');
    console.log('   Add your key to cucumber-ai/.env for live AI explanations');
  } else {
    console.log('✅ Gemini API key configured');
  }
});
