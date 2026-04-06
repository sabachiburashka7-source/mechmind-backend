const express = require('express');
const cors = require('cors');
const { WebSocketServer, WebSocket } = require('ws');
const http = require('http');
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/proxy' });

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_WS = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=' + GEMINI_KEY;

app.get('/', (req, res) => res.json({ status: 'MechMind running', gemini: !!GEMINI_KEY }));

// Text chat
app.post('/chat', async (req, res) => {
  try {
    const { messages, system } = req.body;
    const r = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + GEMINI_KEY,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: system }] },
          contents: messages,
          generationConfig: { maxOutputTokens: 300 }
        })
      }
    );
    res.json(await r.json());
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// WebSocket proxy - backend talks to Gemini, browser talks to backend
wss.on('connection', (browser, req) => {
  console.log('Browser connected from:', req.headers.origin);

  if (!GEMINI_KEY) {
    browser.send(JSON.stringify({ type: 'error', message: 'No Gemini key' }));
    browser.close();
    return;
  }

  // Connect backend to Gemini Live
  const gemini = new WebSocket(GEMINI_WS);
  let setupDone = false;
  let systemPrompt = '';

  // Keep connection alive
  const ping = setInterval(() => {
    if (browser.readyState === WebSocket.OPEN) browser.ping();
    if (gemini.readyState === WebSocket.OPEN) gemini.ping();
  }, 20000);

  gemini.on('open', () => {
    console.log('Gemini connected');
    browser.send(JSON.stringify({ type: 'proxy_ready' }));
  });

  // Forward Gemini → Browser (all live API responses)
  gemini.on('message', (data) => {
    const str = data.toString();
    try {
      const msg = JSON.parse(str);
      if (msg.setupComplete) {
        setupDone = true;
        console.log('Gemini setup complete');
      }
    } catch(e) {}
    if (browser.readyState === WebSocket.OPEN) {
      browser.send(str);
    }
  });

  // Handle messages from browser
  browser.on('message', (data) => {
    const str = data.toString();
    try {
      const msg = JSON.parse(str);

      // Browser sends setup - forward directly to Gemini
      if (msg.setup) {
        systemPrompt = msg.setup.systemInstruction?.parts?.[0]?.text || '';
        console.log('Forwarding setup to Gemini, model:', msg.setup.model);
        if (gemini.readyState === WebSocket.OPEN) gemini.send(str);
        return;
      }

      // Browser sends raw PCM audio as base64
      if (msg.type === 'audio' && msg.data) {
        if (!setupDone || gemini.readyState !== WebSocket.OPEN) return;
        // Backend sends audio to Gemini in correct format
        // Try all possible formats - log which one works
        // Try inline_data format which is standard in Gemini API
        // Proto-based snake_case format
        const audioMsg = {
          realtimeInput: {
            audio: {
              mime_type: 'audio/pcm;rate=16000',
              data: msg.data
            }
          }
        };
        console.log('Sending audio, data length:', msg.data ? msg.data.length : 0);
        gemini.send(JSON.stringify(audioMsg));
        return;
      }

      // Browser sends text (greeting etc)
      if (msg.client_content) {
        if (gemini.readyState === WebSocket.OPEN) gemini.send(str);
        return;
      }

    } catch(e) {}

    // Forward anything else directly
    if (gemini.readyState === WebSocket.OPEN) gemini.send(str);
  });

  gemini.on('close', (code, reason) => {
    const r = reason.toString();
    console.log('Gemini closed:', code, r);
    clearInterval(ping);
    if (browser.readyState === WebSocket.OPEN) {
      browser.send(JSON.stringify({ type: 'gemini_closed', code, reason: r }));
      browser.close();
    }
  });

  gemini.on('error', (e) => {
    console.log('Gemini error:', e.message);
    if (browser.readyState === WebSocket.OPEN) {
      browser.send(JSON.stringify({ type: 'gemini_error', message: e.message }));
    }
  });

  browser.on('close', (code) => {
    console.log('Browser disconnected:', code);
    clearInterval(ping);
    if (gemini.readyState === WebSocket.OPEN) gemini.close();
  });

  browser.on('error', (e) => console.log('Browser WS error:', e.message));
});

server.listen(process.env.PORT || 3000, () => console.log('MechMind proxy running'));
