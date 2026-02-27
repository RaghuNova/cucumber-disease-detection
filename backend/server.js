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

// ─── Gemini integration ─────────────────────────────────────────────────────

async function getGeminiExplanation(disease, confidence) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'YOUR_API_KEY_HERE') {
    throw new Error('GEMINI_API_KEY not configured');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

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

    const { disease, confidence, all_predictions } = mlResponse.data;

    // Get AI explanation — try Gemini first, fall back to detailed local data
    let ai_explanation, metrics;
    const fallback = DISEASE_DATA[disease] || DISEASE_DATA['Healthy_leaves'];

    if (disease === 'Healthy_leaves') {
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

    return res.json({
      success: true,
      disease,
      confidence,
      all_predictions,
      ai_explanation,
      metrics,
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
