const express = require('express');
const cors = require('cors');
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
const multer = require('multer');
const FormData = require('form-data');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const KEY = process.env.OPENAI_API_KEY;

app.get('/', (req, res) => res.json({ status: 'MechMind backend running' }));

app.post('/chat', async (req, res) => {
  try {
    const { messages, system } = req.body;
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${KEY}` },
      body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'system', content: system }, ...messages], max_tokens: 500, temperature: 0.85 })
    });
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: { message: e.message } }); }
});

app.post('/transcribe', upload.single('audio'), async (req, res) => {
  try {
    const form = new FormData();
    const ext = req.file.mimetype.includes('mp4') ? 'mp4' : 'webm';
    form.append('file', req.file.buffer, { filename: `voice.${ext}`, contentType: req.file.mimetype });
    form.append('model', 'whisper-1');
    form.append('language', 'ka');
    const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${KEY}`, ...form.getHeaders() },
      body: form
    });
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/speak', async (req, res) => {
  try {
    const { text } = req.body;
    const r = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini-tts',
        input: text,
        voice: 'alloy',
        speed: 1.0,
        response_format: 'mp3',
        instructions: 'Speak in Georgian language (ქართული). Pronounce all Georgian words naturally.'
      })
    });
    if (!r.ok) {
      // fallback to tts-1
      const r2 = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${KEY}` },
        body: JSON.stringify({ model: 'tts-1', input: text, voice: 'alloy', speed: 1.0, response_format: 'mp3' })
      });
      const buf = await r2.arrayBuffer();
      res.set('Content-Type', 'audio/mpeg');
      return res.send(Buffer.from(buf));
    }
    const buf = await r.arrayBuffer();
    res.set('Content-Type', 'audio/mpeg');
    res.send(Buffer.from(buf));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(process.env.PORT || 3000, () => console.log('MechMind running'));
