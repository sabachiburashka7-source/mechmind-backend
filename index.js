const express = require('express');
const cors = require('cors');
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
const multer = require('multer');
const FormData = require('form-data');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
app.use(cors());
app.use(express.json({ limit: '10mb' }));

function getKey(req) {
  return req.body?.apiKey || process.env.OPENAI_API_KEY || '';
}

app.get('/', (req, res) => {
  res.json({ status: 'MechMind backend running' });
});

app.post('/chat', async (req, res) => {
  try {
    const key = getKey(req);
    const { messages, system } = req.body;
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'system', content: system }, ...messages],
        max_tokens: 500,
        temperature: 0.85
      })
    });
    const data = await response.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: { message: e.message } });
  }
});

app.post('/transcribe', upload.single('audio'), async (req, res) => {
  try {
    const key = req.body?.apiKey || process.env.OPENAI_API_KEY || '';
    const form = new FormData();
    form.append('file', req.file.buffer, {
      filename: 'audio.webm',
      contentType: req.file.mimetype || 'audio/webm'
    });
    form.append('model', 'whisper-1');
    form.append('language', 'ka');
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, ...form.getHeaders() },
      body: form
    });
    const data = await response.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/speak', async (req, res) => {
  try {
    const key = getKey(req);
    const { text } = req.body;
    console.log('Speaking:', text.substring(0, 50));
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice: 'alloy',
        speed: 1.0,
        response_format: 'mp3'
      })
    });
    console.log('TTS status:', response.status);
    if (!response.ok) {
      const err = await response.text();
      console.log('TTS error:', err);
      return res.status(response.status).json({ error: err });
    }
    const buffer = await response.arrayBuffer();
    console.log('Audio size:', buffer.byteLength);
    res.set('Content-Type', 'audio/mpeg');
    res.set('Content-Length', buffer.byteLength);
    res.set('Access-Control-Allow-Origin', '*');
    res.send(Buffer.from(buffer));
  } catch (e) {
    console.log('Speak error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`MechMind running on port ${PORT}`));
