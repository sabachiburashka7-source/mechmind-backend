const express = require('express');
const cors = require('cors');
const { WebSocketServer, WebSocket } = require('ws');
const http = require('http');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=' + GEMINI_KEY;

app.get('/', (req, res) => res.json({ status: 'MechMind running', gemini: !!GEMINI_KEY }));

// WebSocket proxy - browser connects here, we forward to Gemini
wss.on('connection', (browserWs) => {
  console.log('Browser connected, connecting to Gemini Live...');

  const geminiWs = new WebSocket(GEMINI_URL);

  geminiWs.on('open', () => {
    console.log('Gemini Live connected');
    browserWs.send(JSON.stringify({ type: 'proxy_ready' }));
  });

  // Forward Gemini → Browser
  geminiWs.on('message', (data) => {
    if (browserWs.readyState === WebSocket.OPEN) {
      browserWs.send(data.toString());
    }
  });

  // Forward Browser → Gemini
  browserWs.on('message', (data) => {
    if (geminiWs.readyState === WebSocket.OPEN) {
      geminiWs.send(data.toString());
    }
  });

  geminiWs.on('close', (code, reason) => {
    console.log('Gemini closed:', code, reason.toString());
    if (browserWs.readyState === WebSocket.OPEN) {
      browserWs.send(JSON.stringify({ type: 'gemini_closed', code, reason: reason.toString() }));
      browserWs.close();
    }
  });

  geminiWs.on('error', (e) => {
    console.log('Gemini error:', e.message);
    if (browserWs.readyState === WebSocket.OPEN) {
      browserWs.send(JSON.stringify({ type: 'gemini_error', message: e.message }));
    }
  });

  browserWs.on('close', () => {
    console.log('Browser disconnected');
    if (geminiWs.readyState === WebSocket.OPEN) geminiWs.close();
  });

  browserWs.on('error', (e) => console.log('Browser WS error:', e.message));
});

// Text chat via Gemini REST
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

app.post('/chat', async (req, res) => {
  try {
    const { messages, system } = req.body;
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + GEMINI_KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: messages,
        generationConfig: { maxOutputTokens: 300 }
      })
    });
    res.json(await r.json());
  } catch(e) { res.status(500).json({ error: e.message }); }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('MechMind proxy running on', PORT));
