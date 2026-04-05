const express = require('express');
const cors = require('cors');
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
const multer = require('multer');
const FormData = require('form-data');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const KEY = process.env.OPENAI_API_KEY;

app.get('/', (req, res) => {
  console.log('Health check - KEY exists:', !!KEY, 'KEY prefix:', KEY ? KEY.substring(0,7) : 'NONE');
  res.json({ status: 'MechMind backend running', keySet: !!KEY });
});

app.post('/chat', async (req, res) => {
  try {
    const { messages, system } = req.body;
    console.log('Chat request - messages:', messages?.length, 'KEY:', KEY ? KEY.substring(0,7) : 'MISSING');
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${KEY}` },
      body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'system', content: system }, ...messages], max_tokens: 500, temperature: 0.85 })
    });
    const data = await r.json();
    console.log('Chat response status:', r.status, 'error:', data.error?.message || 'none');
    res.json(data);
  } catch (e) {
    console.log('Chat error:', e.message);
    res.status(500).json({ error: { message: e.message } });
  }
});

app.post('/transcribe', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) { return res.status(400).json({ error: 'No audio received' }); }
    console.log('Audio size:', req.file.size, 'type:', req.file.mimetype);
    const form = new FormData();
    let filename = 'voice.webm';
    if (req.file.mimetype.includes('mp4') || req.file.mimetype.includes('m4a')) filename = 'voice.mp4';
    else if (req.file.mimetype.includes('ogg')) filename = 'voice.ogg';
    else if (req.file.mimetype.includes('wav')) filename = 'voice.wav';
    form.append('file', req.file.buffer, { filename, contentType: req.file.mimetype });
    form.append('model', 'whisper-1');
    form.append('response_format', 'json');
    const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${KEY}`, ...form.getHeaders() },
      body: form
    });
    const result = await r.json();
    console.log('Whisper result:', result);
    res.json(result);
  } catch (e) {
    console.log('Transcribe error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/speak', async (req, res) => {
  try {
    const { text } = req.body;
    console.log('Speaking:', text?.substring(0, 60));
    const r = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${KEY}` },
      body: JSON.stringify({ model: 'tts-1', input: text, voice: 'alloy', speed: 1.0, response_format: 'mp3' })
    });
    if (!r.ok) {
      const err = await r.text();
      console.log('TTS error:', err);
      return res.status(500).json({ error: err });
    }
    const buf = await r.arrayBuffer();
    console.log('Audio bytes:', buf.byteLength);
    res.set('Content-Type', 'audio/mpeg');
    res.send(Buffer.from(buf));
  } catch (e) {
    console.log('Speak error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.listen(process.env.PORT || 3000, () => console.log('MechMind running'));
