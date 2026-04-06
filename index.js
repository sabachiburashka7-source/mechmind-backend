const express = require('express');
const cors = require('cors');
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
const multer = require('multer');
const FormData = require('form-data');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
app.use(cors());
app.use(express.json({ limit: '10mb' }));

function getKey(req) {
  return req.body?.apiKey || process.env.OPENAI_API_KEY || '';
}

app.get('/', (req, res) => res.json({ status: 'MechMind backend running' }));

// ── REALTIME TOKEN ──
app.post('/realtime-token', async (req, res) => {
  try {
    const key = getKey(req);
    const { system } = req.body;
    const r = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({
        model: 'gpt-4o-realtime-preview-2024-12-17',
        voice: 'alloy',
        instructions: system,
        modalities: ['text', 'audio'],
        turn_detection: { type: 'server_vad', threshold: 0.5, silence_duration_ms: 800 },
        input_audio_transcription: { model: 'whisper-1' }
      })
    });
    const data = await r.json();
    console.log('Realtime token status:', r.status, data.error?.message || 'ok');
    res.json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── CHAT ──
app.post('/chat', async (req, res) => {
  try {
    const key = getKey(req);
    const { messages, system } = req.body;
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'system', content: system }, ...messages], max_tokens: 500, temperature: 0.85 })
    });
    const data = await r.json();
    console.log('Chat:', r.status, data.error?.message || 'ok');
    res.json(data);
  } catch(e) { res.status(500).json({ error: { message: e.message } }); }
});

// ── SPEAK (for text chat mode) ──
app.post('/speak', async (req, res) => {
  try {
    const key = getKey(req);
    const { text } = req.body;
    const r = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ model: 'tts-1', input: text, voice: 'alloy', response_format: 'mp3' })
    });
    if (!r.ok) { const e = await r.text(); return res.status(500).json({ error: e }); }
    const buf = await r.arrayBuffer();
    res.set('Content-Type', 'audio/mpeg');
    res.send(Buffer.from(buf));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.listen(process.env.PORT || 3000, () => console.log('MechMind running'));
