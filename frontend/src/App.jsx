import { useState, useCallback, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { GiPlantRoots } from 'react-icons/gi';
import {
  FiUploadCloud, FiX, FiDownload, FiAlertCircle, FiChevronDown,
  FiVolume2, FiVolumeX, FiGlobe, FiFileText,
} from 'react-icons/fi';

/* ─── colour tokens ─── */
const C = {
  primaryGreen:  '#1B4332',
  accentGreen:   '#2D6A4F',
  mint:          '#52B788',
  bg:            '#FDFBF7',
  cardBg:        '#FFFFFF',
  surface:       '#F8F5F0',
  border:        '#E6E1D9',
  textPrimary:   '#1A1A1A',
  textSecondary: '#6B6B6B',
  textMuted:     '#9B9B9B',
  red:           '#C1292E',
  orange:        '#E07A3A',
};

/* ─── helpers ─── */
const fmt = (s) =>
  s?.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) ?? '';

const classColor = (name = '') => {
  const n = name.toLowerCase();
  if (n.includes('not_cucumber')) return '#6B7280';
  if (n.includes('healthy')) return C.mint;
  if (n.includes('powdery')) return C.orange;
  return C.red;
};

const bannerTheme = (name = '') => {
  const n = name.toLowerCase();
  if (n.includes('not_cucumber'))
    return { bg: '#F3F4F6', border: '#D1D5DB', text: '#374151' };
  if (n.includes('healthy'))
    return { bg: '#ECFDF5', border: '#A7F3D0', text: '#065F46' };
  if (n.includes('powdery'))
    return { bg: '#FFF7ED', border: '#FED7AA', text: '#9A3412' };
  return { bg: '#FEF2F2', border: '#FECACA', text: '#991B1B' };
};

const severityLabel = (disease, severity) => {
  if (disease?.toLowerCase().includes('not_cucumber')) return 'Invalid Input';
  if (disease?.toLowerCase().includes('healthy')) return 'Healthy';
  if (severity > 60) return 'Severe';
  if (severity > 30) return 'Moderate';
  return 'Mild';
};

const metricColor = (value, inverted = false) => {
  if (inverted) {
    if (value < 30) return C.red;
    if (value <= 60) return C.orange;
    return C.mint;
  }
  if (value < 30) return C.mint;
  if (value <= 60) return C.orange;
  return C.red;
};

/* ─── Confidence ring component ─── */
function ConfidenceRing({ pct, color, size = 90 }) {
  const stroke = 6;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;

  return (
    <svg width={size} height={size} className="confidence-ring">
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke={C.border} strokeWidth={stroke}
      />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round" className="confidence-ring-fill"
      />
    </svg>
  );
}

/* ─── accordion section metadata ─── */
const SECTIONS = [
  { key: 'root_cause',      icon: '🔬', title: 'Root Cause Analysis' },
  { key: 'symptoms',        icon: '🩺', title: 'Symptoms & Indicators' },
  { key: 'prevention',      icon: '🛡️', title: 'Prevention Methods' },
  { key: 'early_detection', icon: '🔍', title: 'Early Detection Guide' },
  { key: 'farmer_loss',     icon: '📉', title: 'Economic Impact' },
  { key: 'treatment',       icon: '💊', title: 'Treatment Protocol' },
];

/* ─── risk metric definitions ─── */
const METRICS = [
  { key: 'severity',          label: 'Severity Level',    inverted: false },
  { key: 'spread_risk',       label: 'Spread Risk',       inverted: false },
  { key: 'treatment_urgency', label: 'Treatment Urgency', inverted: false },
  { key: 'recovery_chance',   label: 'Recovery Chance',   inverted: true },
  { key: 'yield_impact',      label: 'Yield Impact',      inverted: false },
];

/* ─── urgency config ─── */
const URGENCY_CONFIG = {
  CRITICAL: { color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
  HIGH:     { color: '#EA580C', bg: '#FFF7ED', border: '#FED7AA' },
  MEDIUM:   { color: '#CA8A04', bg: '#FEFCE8', border: '#FEF08A' },
  LOW:      { color: '#16A34A', bg: '#F0FDF4', border: '#A7F3D0' },
  NONE:     { color: '#16A34A', bg: '#F0FDF4', border: '#A7F3D0' },
  UNKNOWN:  { color: '#6B7280', bg: '#F9FAFB', border: '#E5E7EB' },
};

const getUrgencyLevel = (confidence, disease) => {
  if (!disease || disease === 'Not_Cucumber_Leaf') return 'UNKNOWN';
  if (disease?.toLowerCase().includes('healthy')) return 'NONE';
  if (confidence < 60) return 'LOW';
  if (confidence < 80) return 'MEDIUM';
  if (confidence < 90) return 'HIGH';
  return 'CRITICAL';
};

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'Hindi' },
  { value: 'kn', label: 'Kannada' },
];

/* ═══════════════════════════════════════════════
   App
   ═══════════════════════════════════════════════ */
export default function App() {
  const [file, setFile]                   = useState(null);
  const [preview, setPreview]             = useState(null);
  const [loading, setLoading]             = useState(false);
  const [result, setResult]               = useState(null);
  const [error, setError]                 = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [expandedSection, setExpandedSection] = useState('root_cause');

  // farmer features state
  const [language, setLanguage]                   = useState('en');
  const [farmerData, setFarmerData]               = useState(null);
  const [farmerDataLoading, setFarmerDataLoading] = useState(false);
  const [translatedData, setTranslatedData]       = useState(null);
  const [isTranslating, setIsTranslating]         = useState(false);
  const [translatedAI, setTranslatedAI]           = useState(null);
  const [isTranslatingAI, setIsTranslatingAI]     = useState(false);
  const [isSpeaking, setIsSpeaking]               = useState(false);
  const [voiceLoading, setVoiceLoading]           = useState(false);
  const [quickReportLoading, setQuickReportLoading] = useState(false);

  const resultsRef = useRef(null);
  const uploadRef  = useRef(null);
  const heroRef    = useRef(null);
  const audioRef   = useRef(null);  // tracks current Kannada TTS audio

  /* ── dropzone ── */
  const onDrop = useCallback((accepted) => {
    if (!accepted.length) return;
    const f = accepted[0];
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setError(null);
    setResult(null);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpg', '.jpeg', '.png'] },
    multiple: false,
    maxSize: 10 * 1024 * 1024,
  });

  const removeFile = () => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    setFarmerData(null);
    setTranslatedData(null);
    setTranslatedAI(null);
    setLanguage('en');
    setVoiceLoading(false);
    if (isSpeaking) { window.speechSynthesis.cancel(); setIsSpeaking(false); }
  };

  const scrollToUpload = () => {
    uploadRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const scrollToHero = () => {
    heroRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  /* ── predict ── */
  const handleAnalyze = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append('image', file);
      const { data } = await axios.post('/api/predict', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(data);
      setExpandedSection('root_cause');
      fetchFarmerFeatures(data.disease, data.confidence, language, data.ai_explanation);
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 120);
    } catch (err) {
      setError(
        err.response?.data?.error ||
        'Something went wrong analysing the image. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  /* ── report download ── */
  const handleReport = async () => {
    if (!result) return;
    setReportLoading(true);
    try {
      const res = await axios.post('/api/report', result, {
        responseType: 'blob',
      });
      const url = URL.createObjectURL(
        new Blob([res.data], { type: 'application/pdf' }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = `CucumberGuard_Report_${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError('Failed to generate report. Please try again.');
    } finally {
      setReportLoading(false);
    }
  };

  /* ── fetch farmer features ── */
  const fetchFarmerFeatures = async (disease, confidence, currentLang, aiExplanation) => {
    setFarmerDataLoading(true);
    try {
      const { data } = await axios.post('/api/farmer-features', { disease, confidence });
      setFarmerData(data);
      if (currentLang !== 'en') {
        await doTranslate(data, currentLang);
      }
    } catch (err) {
      console.error('Farmer features error:', err.message);
    } finally {
      setFarmerDataLoading(false);
    }
    if (currentLang !== 'en' && aiExplanation) {
      await doTranslateAI(aiExplanation, currentLang);
    }
  };

  /* ── translate farmer data ── */
  const doTranslate = async (data, lang) => {
    setIsTranslating(true);
    try {
      const texts = {
        urgency_explanation:   data.urgency_explanation,
        crop_loss_explanation: data.crop_loss?.explanation,
        india_root_cause:      data.india_advice?.root_cause,
        india_when:            data.india_advice?.when,
        india_prevention:      data.india_advice?.prevention,
        india_treatment:       data.india_advice?.treatment,
        week1:      data.ignored_timeline?.week1,
        week2:      data.ignored_timeline?.week2,
        week3:      data.ignored_timeline?.week3,
        final_loss: data.ignored_timeline?.final_loss,
      };
      const { data: resp } = await axios.post('/api/translate', { texts, language: lang });
      if (resp.success) setTranslatedData(resp.translated);
    } catch (e) {
      console.error('Translation failed:', e.message);
    } finally {
      setIsTranslating(false);
    }
  };

  /* ── translate ai_explanation sections ── */
  const doTranslateAI = async (aiExplanation, lang) => {
    if (!aiExplanation || lang === 'en') { setTranslatedAI(null); return; }
    setIsTranslatingAI(true);
    try {
      const texts = {
        root_cause:      aiExplanation.root_cause,
        symptoms:        aiExplanation.symptoms,
        prevention:      aiExplanation.prevention,
        early_detection: aiExplanation.early_detection,
        farmer_loss:     aiExplanation.farmer_loss,
        treatment:       aiExplanation.treatment,
      };
      const { data: resp } = await axios.post('/api/translate', { texts, language: lang });
      if (resp.success) setTranslatedAI(resp.translated);
    } catch (e) {
      console.error('AI Translation failed:', e.message);
    } finally {
      setIsTranslatingAI(false);
    }
  };

  /* ── change language ── */
  const handleLanguageChange = async (newLang) => {
    setLanguage(newLang);
    setTranslatedData(null);
    setTranslatedAI(null);
    if (newLang === 'en') return;
    if (farmerData) await doTranslate(farmerData, newLang);
    if (result?.ai_explanation) await doTranslateAI(result.ai_explanation, newLang);
  };

  /* ── voice (Kannada) — uses Google Translate TTS via backend proxy ── */
  const handleVoice = async () => {
    const text = result?.voiceText || farmerData?.kannada_voice_text;
    if (!text) return;

    // Stop if already playing
    if (isSpeaking) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setIsSpeaking(false);
      return;
    }

    setIsSpeaking(true);
    try {
      const { data } = await axios.post(
        '/api/speak',
        { text },
        { responseType: 'blob' },
      );
      const url = URL.createObjectURL(new Blob([data], { type: 'audio/mpeg' }));
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(url);
        audioRef.current = null;
      };
      audio.onerror = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(url);
        audioRef.current = null;
      };
      audio.play();
    } catch {
      setIsSpeaking(false);
    }
  };

  /* ── quick farmer report PDF ── */
  const handleQuickReport = async () => {
    if (!result || !farmerData) return;
    setQuickReportLoading(true);
    try {
      const res = await axios.post('/api/quick-report', {
        disease:             result.disease,
        confidence:          result.confidence,
        urgency_level:       farmerData.urgency_level,
        crop_loss:           farmerData.crop_loss,
        india_advice:        farmerData.india_advice,
        ignored_timeline:    farmerData.ignored_timeline,
        urgency_explanation: farmerData.urgency_explanation,
      }, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `Farmer-Quick-Report-${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError('Failed to generate quick report. Please try again.');
    } finally {
      setQuickReportLoading(false);
    }
  };

  /* ── derived chart data ── */
  const confData = result?.all_predictions?.map((p) => ({
    name: fmt(p.class),
    confidence: p.confidence,
    fill: classColor(p.class),
  })) ?? [];

  const banner = result ? bannerTheme(result.disease) : null;

  /* ══════════════════════════════ render ══════════════════════════════ */
  return (
    <div className="grain-overlay min-h-screen flex flex-col" style={{ backgroundColor: C.bg }}>

      {/* ═══ SECTION 1 — STICKY HEADER ═══ */}
      <header className="sticky top-0 z-50" style={{ backgroundColor: C.primaryGreen }}>
        <div className="max-w-6xl mx-auto px-6 h-12 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <GiPlantRoots className="text-lg" style={{ color: '#81C9A3' }} />
            <span
              className="text-sm font-semibold text-white tracking-tight"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              CucumberGuard
            </span>
          </div>
          <div className="flex items-center gap-4">
            <nav className="hidden sm:flex items-center gap-3 text-xs font-semibold tracking-wide">
              <button onClick={scrollToHero} className="text-white/80 hover:text-white">Home</button>
              <button onClick={scrollToUpload} className="text-white/80 hover:text-white">Upload</button>
              <button onClick={() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className="text-white/80 hover:text-white">
                Results
              </button>
            </nav>

            {/* Language selector */}
            <div className="flex items-center gap-1.5">
              <FiGlobe style={{ color: '#A7F3D0', fontSize: 13 }} />
              <select
                value={language}
                onChange={(e) => handleLanguageChange(e.target.value)}
                style={{
                  background: '#2D6A4F',
                  color: '#fff',
                  border: '1px solid rgba(167,243,208,0.4)',
                  borderRadius: 6,
                  padding: '3px 8px',
                  fontSize: 12,
                  fontWeight: 600,
                  outline: 'none',
                  cursor: 'pointer',
                  appearance: 'auto',
                }}
              >
                {LANGUAGE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div
              className="ai-badge px-3 py-1 rounded-full text-xs font-medium tracking-wide"
              style={{ color: '#A7F3D0', border: '1px solid rgba(167, 243, 208, 0.25)' }}
            >
              AI Powered
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-6 pb-24">

        {/* ═══ SECTION 2 — HERO ═══ */}
        <section ref={heroRef} className="pt-16 pb-14 md:pt-24 md:pb-20 animate-fade-in-up">
          <h1
            className="text-3xl sm:text-4xl md:text-5xl font-bold leading-tight tracking-tight mb-5"
            style={{
              fontFamily: "'Playfair Display', serif",
              color: C.primaryGreen,
              maxWidth: '680px',
            }}
          >
            Detect cucumber leaf{' '}
            <br className="hidden md:block" />
            diseases in seconds
          </h1>

          <p
            className="max-w-xl mb-8"
            style={{ color: C.textSecondary, fontSize: '15px', lineHeight: '1.65' }}
          >
            Upload a leaf image. Our deep learning model identifies diseases
            instantly and provides AI-generated treatment guidance from Google Gemini.
          </p>

          <div className="flex flex-wrap gap-3">
            {['3 Disease Classes', '92% Model Accuracy', 'AI Treatment Plans'].map(
              (text) => (
                <span
                  key={text}
                  className="stat-pill px-4 py-1.5 rounded-full text-xs font-medium tracking-wide"
                  style={{
                    backgroundColor: C.surface,
                    color: C.accentGreen,
                    border: `1px solid ${C.border}`,
                  }}
                >
                  {text}
                </span>
              ),
            )}
          </div>
        </section>

        {/* ═══ SECTION 3 — UPLOAD CARD ═══ */}
        <section ref={uploadRef} className="mb-16 animate-fade-in-up stagger-1">
          <div
            className="rounded-2xl p-7 md:p-10"
            style={{ backgroundColor: C.cardBg, border: `1px solid ${C.border}` }}
          >
            {/* dropzone / preview */}
            {!preview ? (
              <div
                {...getRootProps()}
                className={`dropzone rounded-xl cursor-pointer flex flex-col items-center
                  justify-center py-16 md:py-20 px-6 text-center transition-all duration-300
                  ${isDragActive ? 'dropzone-active' : ''}`}
              >
                <input {...getInputProps()} />
                <FiUploadCloud className="text-4xl mb-4" style={{ color: C.mint }} />
                <p className="text-base font-medium mb-1.5" style={{ color: C.textPrimary }}>
                  {isDragActive
                    ? 'Drop your image here…'
                    : 'Drop your cucumber leaf image here'}
                </p>
                <p className="text-sm" style={{ color: C.textMuted }}>
                  or click to select · JPG, PNG up to 10MB
                </p>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row items-center gap-6">
                <div
                  className="relative flex-shrink-0 rounded-xl overflow-hidden"
                  style={{ width: 200, height: 200 }}
                >
                  <img
                    src={preview}
                    alt="Selected leaf"
                    className="w-full h-full object-cover"
                  />
                  <button
                    onClick={removeFile}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center
                      justify-center bg-red-500/90 hover:bg-red-600 transition-colors cursor-pointer"
                    aria-label="Remove image"
                  >
                    <FiX className="text-sm text-white" />
                  </button>
                </div>
                <div className="flex-1 text-center sm:text-left">
                  <p
                    className="text-sm font-medium truncate max-w-xs"
                    style={{ color: C.textPrimary }}
                  >
                    {file?.name}
                  </p>
                  <p className="text-xs mt-1" style={{ color: C.textMuted }}>
                    {(file?.size / 1024).toFixed(0)} KB
                  </p>
                </div>
              </div>
            )}

            {/* analyse button */}
            {preview && (
              <button
                onClick={handleAnalyze}
                disabled={loading}
                className="w-full mt-8 flex items-center justify-center gap-2.5
                  rounded-lg text-white font-semibold text-base tracking-wide
                  transition-all duration-300 hover:shadow-lg
                  disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                style={{
                  height: '48px',
                  backgroundColor: loading ? '#40916C' : C.accentGreen,
                  boxShadow: '0 2px 16px rgba(45,106,79,0.22)',
                }}
              >
                {loading ? (
                  <>
                    <span className="spinner" />
                    Analysing with AI…
                  </>
                ) : (
                  'Analyse Leaf'
                )}
              </button>
            )}

            {/* error banner */}
            {error && (
              <div
                className="mt-6 flex items-start gap-3 p-4 rounded-lg animate-fade-in"
                style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA' }}
              >
                <FiAlertCircle
                  className="text-lg flex-shrink-0 mt-0.5"
                  style={{ color: C.red }}
                />
                <p className="text-sm" style={{ color: '#991B1B' }}>
                  {error}
                </p>
              </div>
            )}
          </div>
        </section>

        {/* ═══ SECTION 4 — RESULTS ═══ */}
        {result && (
          <div ref={resultsRef} className="scroll-mt-16">

            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-semibold" style={{ color: C.textSecondary }}>
                Analysis Result
              </h3>
              <button
                onClick={() => { removeFile(); scrollToUpload(); }}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
                style={{ backgroundColor: C.surface, color: C.textPrimary, border: `1px solid ${C.border}` }}
              >
                ← Back to Upload
              </button>
            </div>

            {/* 4a — Diagnosis Banner */}
            <section className="mb-10 animate-fade-in-up">
              <div
                className="rounded-2xl p-6 md:p-8 flex flex-col sm:flex-row items-center gap-6"
                style={{ backgroundColor: banner.bg, border: `1px solid ${banner.border}` }}
              >
                {preview && (
                  <img
                    src={preview}
                    alt="Analysed leaf"
                    className="w-20 h-20 rounded-xl object-cover flex-shrink-0"
                  />
                )}

                <div className="flex-1 text-center sm:text-left">
                  <span
                    className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold
                      uppercase tracking-wider mb-1.5"
                    style={{
                      backgroundColor: classColor(result.disease) + '20',
                      color: banner.text,
                    }}
                  >
                    {severityLabel(result.disease, result.metrics?.severity)}
                  </span>
                  <h2
                    className="text-2xl md:text-3xl font-bold"
                    style={{ fontFamily: "'Playfair Display', serif", color: banner.text }}
                  >
                    {fmt(result.disease)}
                  </h2>
                  {result.message && (
                    <p className="text-sm mt-2" style={{ color: banner.text, opacity: 0.9 }}>
                      {result.message}
                    </p>
                  )}
                </div>

                <div
                  className="relative flex-shrink-0"
                  style={{ width: 90, height: 90 }}
                >
                  <ConfidenceRing
                    pct={result.confidence}
                    color={classColor(result.disease)}
                    size={90}
                  />
                  <span
                    className="absolute inset-0 flex items-center justify-center
                      text-lg font-bold"
                    style={{ color: banner.text }}
                  >
                    {result.confidence}%
                  </span>
                </div>
              </div>
            </section>

            {/* ── Farmer insights loading ── */}
            {farmerDataLoading && (
              <div
                className="mb-8 flex items-center gap-3 p-4 rounded-2xl animate-fade-in"
                style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
              >
                <span className="spinner" style={{ borderColor: 'rgba(45,106,79,0.25)', borderTopColor: C.accentGreen }} />
                <p className="text-sm" style={{ color: C.textSecondary }}>Loading farmer insights…</p>
              </div>
            )}

            {/* ── Farmer sections 3–8 ── */}
            {farmerData && (
              <>
                {/* 3 — Treatment Urgency */}
                <section className="mb-10 animate-fade-in-up stagger-1">
                  <h2
                    className="text-xl md:text-2xl font-bold mb-5"
                    style={{ fontFamily: "'Playfair Display', serif", color: C.primaryGreen }}
                  >
                    Treatment Urgency
                  </h2>
                  <div
                    className="rounded-2xl p-6 md:p-8"
                    style={{
                      backgroundColor: URGENCY_CONFIG[farmerData.urgency_level]?.bg || C.surface,
                      border: `1px solid ${URGENCY_CONFIG[farmerData.urgency_level]?.border || C.border}`,
                    }}
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <span
                        className="px-5 py-2 rounded-full text-sm font-bold uppercase tracking-widest text-white"
                        style={{ backgroundColor: URGENCY_CONFIG[farmerData.urgency_level]?.color || '#9CA3AF' }}
                      >
                        {farmerData.urgency_level}
                      </span>
                    </div>
                    <p className="text-sm" style={{ color: C.textSecondary, lineHeight: 1.75 }}>
                      {isTranslating
                        ? <span style={{ color: C.textMuted }}>Translating…</span>
                        : (translatedData?.urgency_explanation || farmerData.urgency_explanation)}
                    </p>
                  </div>
                </section>

                {/* 4 — Crop Loss Estimate */}
                <section className="mb-10 animate-fade-in-up stagger-2">
                  <h2
                    className="text-xl md:text-2xl font-bold mb-5"
                    style={{ fontFamily: "'Playfair Display', serif", color: C.primaryGreen }}
                  >
                    Crop Loss Estimate
                  </h2>
                  <div
                    className="rounded-2xl p-6 md:p-8"
                    style={{ backgroundColor: C.cardBg, border: `1px solid ${C.border}` }}
                  >
                    <p
                      className="text-4xl font-bold mb-3"
                      style={{ color: farmerData.crop_loss.min === 0 ? C.mint : C.red }}
                    >
                      {farmerData.crop_loss.min}% – {farmerData.crop_loss.max}%
                    </p>
                    <p className="text-sm" style={{ color: C.textSecondary, lineHeight: 1.75 }}>
                      {isTranslating
                        ? <span style={{ color: C.textMuted }}>Translating…</span>
                        : (translatedData?.crop_loss_explanation || farmerData.crop_loss.explanation)}
                    </p>
                  </div>
                </section>

                {/* 5 — Localized India Advice */}
                <section className="mb-10 animate-fade-in-up stagger-3">
                  <h2
                    className="text-xl md:text-2xl font-bold mb-5"
                    style={{ fontFamily: "'Playfair Display', serif", color: C.primaryGreen }}
                  >
                    🇮🇳 Localized Advice (India)
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {[
                      { label: '🌱 Root Cause',       tKey: 'india_root_cause', val: farmerData.india_advice.root_cause },
                      { label: '📅 When It Occurs',   tKey: 'india_when',       val: farmerData.india_advice.when },
                      { label: '🛡️ Prevention Steps', tKey: 'india_prevention', val: farmerData.india_advice.prevention },
                      { label: '💊 Treatment Steps',  tKey: 'india_treatment',  val: farmerData.india_advice.treatment },
                    ].map(({ label, tKey, val }) => (
                      <div
                        key={tKey}
                        className="rounded-xl p-5"
                        style={{ backgroundColor: C.cardBg, border: `1px solid ${C.border}` }}
                      >
                        <p
                          className="text-xs font-semibold uppercase tracking-wider mb-2"
                          style={{ color: C.textMuted }}
                        >
                          {label}
                        </p>
                        <p
                          className="text-sm"
                          style={{ color: C.textSecondary, lineHeight: 1.75, whiteSpace: 'pre-line' }}
                        >
                          {isTranslating
                            ? <span style={{ color: C.textMuted }}>Translating…</span>
                            : (translatedData?.[tKey] || val)}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>

                {/* 6 — What Happens If Ignored */}
                <section className="mb-10 animate-fade-in-up stagger-4">
                  <h2
                    className="text-xl md:text-2xl font-bold mb-5"
                    style={{ fontFamily: "'Playfair Display', serif", color: C.primaryGreen }}
                  >
                    ⚠️ What Happens If Ignored
                  </h2>
                  <div
                    className="rounded-2xl p-6 md:p-8"
                    style={{ backgroundColor: C.cardBg, border: `1px solid ${C.border}` }}
                  >
                    <div className="flex flex-col gap-5">
                      {[
                        { label: 'Week 1', key: 'week1', color: '#EAB308' },
                        { label: 'Week 2', key: 'week2', color: '#F97316' },
                        { label: 'Week 3', key: 'week3', color: '#EF4444' },
                      ].map(({ label, key, color }) => (
                        <div key={key} className="flex items-start gap-4">
                          <span
                            className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold text-white"
                            style={{ backgroundColor: color }}
                          >
                            {label}
                          </span>
                          <p className="text-sm pt-0.5" style={{ color: C.textSecondary, lineHeight: 1.75 }}>
                            {isTranslating
                              ? <span style={{ color: C.textMuted }}>Translating…</span>
                              : (translatedData?.[key] || farmerData.ignored_timeline[key])}
                          </p>
                        </div>
                      ))}
                      <div className="pt-4" style={{ borderTop: `1px solid ${C.border}` }}>
                        <p className="text-sm font-semibold" style={{ color: C.red }}>
                          🚨 Final Result:{' '}
                          {isTranslating ? '…' : (translatedData?.final_loss || farmerData.ignored_timeline.final_loss)}
                        </p>
                      </div>
                    </div>
                  </div>
                </section>

                {/* 7 + 8 — Quick Report + Voice */}
                <section className="mb-10 animate-fade-in-up">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <button
                      onClick={handleQuickReport}
                      disabled={quickReportLoading}
                      className="flex items-center justify-center gap-2.5 px-5 py-4 rounded-2xl
                        text-white font-semibold text-sm cursor-pointer transition-all duration-300
                        hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed"
                      style={{ backgroundColor: C.primaryGreen, boxShadow: '0 2px 12px rgba(27,67,50,0.18)' }}
                    >
                      {quickReportLoading
                        ? <><span className="spinner" /> Generating Report…</>
                        : <><FiFileText className="text-base" /> Generate Quick Farmer Report</>}
                    </button>

                    <button
                      onClick={handleVoice}
                      disabled={!(result?.voiceText || farmerData?.kannada_voice_text)}
                      className="flex items-center justify-center gap-2.5 px-5 py-4 rounded-2xl
                        font-semibold text-sm cursor-pointer transition-all duration-300 hover:shadow-lg
                        disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{
                        backgroundColor: isSpeaking ? '#FEF2F2' : C.surface,
                        color: isSpeaking ? C.red : C.textPrimary,
                        border: `1px solid ${isSpeaking ? '#FECACA' : C.border}`,
                      }}
                    >
                      {isSpeaking
                        ? <><FiVolumeX className="text-base" /> Stop Voice</>
                        : <><FiVolume2 className="text-base" /> Enable Voice Advice (Kannada)</>}
                    </button>
                  </div>

                  {/* Kannada text preview */}
                  {(result?.voiceText || farmerData?.kannada_voice_text) && (
                    <div
                      className="mt-4 rounded-xl p-4"
                      style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
                    >
                      <p
                        className="text-xs font-semibold uppercase tracking-wider mb-2"
                        style={{ color: C.textMuted }}
                      >
                        🔊 Voice Content (Kannada)
                      </p>
                      {(result?.voiceText || farmerData?.kannada_voice_text)
                        .split('\n')
                        .filter(Boolean)
                        .map((line, i) => (
                          <p
                            key={i}
                            className="text-sm"
                            style={{ color: C.textSecondary, lineHeight: 1.8, fontFamily: "'Noto Sans Kannada', sans-serif" }}
                          >
                            {line}
                          </p>
                        ))}
                    </div>
                  )}
                </section>
              </>
            )}

            {/* 4b — Risk Assessment Dashboard */}
            {result.metrics && (
              <section className="mb-10 animate-fade-in-up stagger-1">
                <h2
                  className="text-xl md:text-2xl font-bold mb-5"
                  style={{ fontFamily: "'Playfair Display', serif", color: C.primaryGreen }}
                >
                  Risk Assessment
                </h2>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                  {METRICS.map(({ key, label, inverted }) => {
                    const value = result.metrics[key] ?? 0;
                    const color = metricColor(value, inverted);
                    return (
                      <div
                        key={key}
                        className="metric-card rounded-xl p-4"
                        style={{ backgroundColor: C.cardBg, border: `1px solid ${C.border}` }}
                      >
                        <p
                          className="text-xs font-medium uppercase tracking-wider mb-3"
                          style={{ color: C.textMuted, letterSpacing: '0.08em' }}
                        >
                          {label}
                        </p>
                        <p className="text-3xl font-bold mb-3" style={{ color }}>
                          {value}
                        </p>
                        <div
                          className="w-full h-1.5 rounded-full"
                          style={{ backgroundColor: '#F0EDE8' }}
                        >
                          <div
                            className="metric-bar h-full rounded-full"
                            style={{ width: `${value}%`, backgroundColor: color }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* 4c — AI Insights Accordion */}
            {result.ai_explanation && (
              <section className="mb-10 animate-fade-in-up stagger-2">
                <h2
                  className="text-xl md:text-2xl font-bold mb-5"
                  style={{ fontFamily: "'Playfair Display', serif", color: C.primaryGreen }}
                >
                  AI Analysis
                </h2>

                <div
                  className="rounded-2xl overflow-hidden"
                  style={{ backgroundColor: C.cardBg, border: `1px solid ${C.border}` }}
                >
                  {SECTIONS.map(({ key, icon, title }, i) => {
                    const text = result.ai_explanation[key];
                    if (!text) return null;
                    const isOpen = expandedSection === key;
                    return (
                      <div
                        key={key}
                        style={{ borderTop: i > 0 ? `1px solid ${C.border}` : 'none' }}
                      >
                        <button
                          onClick={() => setExpandedSection(isOpen ? null : key)}
                          className="w-full flex items-center gap-3 px-6 py-4 text-left
                            cursor-pointer transition-colors duration-200"
                          style={{ backgroundColor: isOpen ? '#FAF8F3' : 'transparent' }}
                          onMouseEnter={(e) => {
                            if (!isOpen) e.currentTarget.style.backgroundColor = '#FDFBF7';
                          }}
                          onMouseLeave={(e) => {
                            if (!isOpen) e.currentTarget.style.backgroundColor = 'transparent';
                          }}
                          aria-expanded={isOpen}
                        >
                          <span className="text-xl flex-shrink-0">{icon}</span>
                          <span
                            className="flex-1 text-sm font-semibold"
                            style={{ color: C.textPrimary }}
                          >
                            {title}
                          </span>
                          <FiChevronDown
                            className="flex-shrink-0 transition-transform duration-300"
                            style={{
                              color: C.textMuted,
                              transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                            }}
                          />
                        </button>

                        <div className={`accordion-body ${isOpen ? 'accordion-open' : ''}`}>
                          <div className="accordion-inner">
                            <div className="px-6 pb-5 pt-0">
                              <p
                                className="text-sm leading-relaxed pl-9"
                                style={{ color: C.textSecondary, lineHeight: '1.75' }}
                              >
                                {isTranslatingAI
                                  ? <span style={{ color: C.textMuted }}>Translating…</span>
                                  : (translatedAI?.[key] || text)}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* 4d — Confidence Distribution Chart */}
            {confData.length > 0 && (
              <section className="mb-10 animate-fade-in-up stagger-3">
                <h2
                  className="text-xl md:text-2xl font-bold mb-5"
                  style={{ fontFamily: "'Playfair Display', serif", color: C.primaryGreen }}
                >
                  Model Confidence Distribution
                </h2>

                <div
                  className="rounded-2xl p-6 md:p-8"
                  style={{ backgroundColor: C.cardBg, border: `1px solid ${C.border}` }}
                >
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart
                      data={confData}
                      barSize={48}
                      margin={{ top: 10, right: 10, left: -10, bottom: 10 }}
                    >
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 12, fill: C.textMuted, fontFamily: 'Inter' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        domain={[0, 100]}
                        tick={{ fontSize: 11, fill: C.textMuted, fontFamily: 'Inter' }}
                        axisLine={false}
                        tickLine={false}
                        unit="%"
                      />
                      <Tooltip
                        formatter={(v) => `${v}%`}
                        contentStyle={{
                          borderRadius: 10,
                          border: `1px solid ${C.border}`,
                          fontSize: 13,
                          fontFamily: 'Inter',
                        }}
                        cursor={{ fill: 'rgba(0,0,0,0.03)' }}
                      />
                      <Bar dataKey="confidence" radius={[8, 8, 0, 0]}>
                        {confData.map((entry, idx) => (
                          <Cell key={idx} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>
            )}

            {/* 4e — Download Report */}
            <section className="mb-10 animate-fade-in-up stagger-4">
              <div
                className="rounded-2xl p-7 md:p-10 flex flex-col sm:flex-row
                  items-start sm:items-center justify-between gap-6"
                style={{ backgroundColor: C.cardBg, border: `1px solid ${C.border}` }}
              >
                <div>
                  <h2
                    className="text-lg md:text-xl font-bold mb-2"
                    style={{ fontFamily: "'Playfair Display', serif", color: C.primaryGreen }}
                  >
                    Download Full Report
                  </h2>
                  <p className="text-sm max-w-md" style={{ color: C.textSecondary }}>
                    Get a comprehensive PDF with complete disease analysis, AI insights,
                    and treatment recommendations.
                  </p>
                </div>

                <button
                  onClick={handleReport}
                  disabled={reportLoading}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-lg
                    text-white text-sm font-semibold tracking-wide flex-shrink-0
                    transition-all duration-300 hover:shadow-lg
                    disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                  style={{
                    backgroundColor: reportLoading ? '#40916C' : C.accentGreen,
                    boxShadow: '0 2px 12px rgba(45,106,79,0.18)',
                  }}
                >
                  {reportLoading ? (
                    <>
                      <span className="spinner" />
                      Generating…
                    </>
                  ) : (
                    <>
                      <FiDownload />
                      Download PDF
                    </>
                  )}
                </button>
              </div>
            </section>
          </div>
        )}
      </main>

      {/* ═══ SECTION 5 — FOOTER ═══ */}
      <footer className="mt-auto py-10" style={{ borderTop: `1px solid ${C.border}` }}>
        <div className="max-w-6xl mx-auto px-6 text-center">
          <p className="text-sm" style={{ color: C.textMuted }}>
            Powered by TensorFlow &amp; Google Gemini AI
          </p>
          <p className="text-xs mt-2" style={{ color: C.textMuted }}>
            Built for smarter agriculture 🌱
          </p>
        </div>
      </footer>
    </div>
  );
}
