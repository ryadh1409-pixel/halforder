/**
 * OpenAI Responses API proxy (CommonJS).
 * Run: npm run server:index
 *
 * Set OPENAI_API_KEY in .env (never commit real keys).
 */
require('dotenv').config();

const express = require('express');

const app = express();

app.use(express.json({ limit: '256kb' }));

app.use((req, res, next) => {
  console.log(`[req] ${req.method} ${req.url}`);
  next();
});

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const AGENT_SYSTEM_PROMPT = `You are an AI food agent.

You DO NOT ask the user to choose.

You decide and recommend.

Return ONLY JSON (no markdown, no prose):

{
  "intent": "recommend_order",
  "restaurant": "",
  "food": "",
  "estimated_price": 0,
  "suggest_split": false,
  "reason": ""
}

Rules:
- Always recommend ONE best option (one restaurant name, one dish).
- If estimated_price > 20 → suggest_split must be true.
- Be decisive; no multiple choices or questions.
- Use realistic US-style prices as numbers (e.g. 18.5).
- intent must be "recommend_order" unless the user only gave location — then you may use intent "ask_location" with empty strings and zeros where not applicable.
- For a normal food request, intent is always "recommend_order".`;

const OPENAI_FETCH_TIMEOUT_MS = 10_000;

app.get('/', (req, res) => {
  console.log('GET / hit');
  res.send('Server works');
});

/** Health / babysit check — confirms logging pipeline */
app.get('/babysit', (req, res) => {
  console.log('GET /babysit hit');
  res.send('babysit ok');
});

app.post('/chat', async (req, res) => {
  try {
    console.log('Incoming message:', req.body);

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error('[chat] OPENAI_API_KEY is not set');
      return res.status(500).json({ error: 'OPENAI_API_KEY is not set' });
    }

    const { message } = req.body ?? {};
    if (message == null || message === '') {
      return res.status(400).json({ error: 'No message provided' });
    }

    const input = typeof message === 'string' ? message : String(message);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OPENAI_FETCH_TIMEOUT_MS);

    let response;
    try {
      response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          instructions: AGENT_SYSTEM_PROMPT,
          input,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      const name =
        error && typeof error === 'object' && 'name' in error ? error.name : '';
      if (name === 'AbortError') {
        console.error(
          `[chat] OpenAI request aborted after ${OPENAI_FETCH_TIMEOUT_MS}ms`,
        );
        return res.status(504).json({
          error: 'OpenAI request timed out',
          details: `No response within ${OPENAI_FETCH_TIMEOUT_MS / 1000}s`,
        });
      }
      console.error('[chat] Fetch error:', error);
      return res.status(502).json({
        error: error instanceof Error ? error.message : 'Failed to reach OpenAI',
      });
    } finally {
      clearTimeout(timeout);
    }

    console.log('OpenAI status:', response.status);

    const text = await response.text();
    console.log('Raw OpenAI:', text.slice(0, 2000));

    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }

    if (!response.ok) {
      const status =
        response.status >= 400 && response.status < 600 ? response.status : 502;
      return res.status(status).json(data);
    }

    return res.json(data);
  } catch (error) {
    console.error('ERROR:', error);
    if (res.headersSent) {
      console.error('[chat] Response already sent');
      return;
    }
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Server error',
    });
  }
});

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
