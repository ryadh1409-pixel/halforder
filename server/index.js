/**
 * Minimal OpenAI Responses API proxy.
 *
 * Set OPENAI_API_KEY in .env (never commit real keys).
 * Run: node server/index.js
 */
require('dotenv').config();

const express = require('express');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '256kb' }));

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

app.post('/chat', async (req, res) => {
  const logPrefix = '[chat]';

  try {
    console.log(`${logPrefix} Incoming request:`, {
      method: req.method,
      hasBody: req.body != null,
      bodyKeys:
        req.body && typeof req.body === 'object' ? Object.keys(req.body) : [],
    });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error(`${logPrefix} OPENAI_API_KEY is not set`);
      return res.status(500).json({
        error: 'OPENAI_API_KEY is not set. Add it to your .env file.',
      });
    }

    const { message } = req.body ?? {};
    if (typeof message !== 'string' || !message.trim()) {
      console.warn(`${logPrefix} Bad request: missing or empty "message" string`);
      return res.status(400).json({
        error: 'Expected JSON body: { "message": "..." }',
      });
    }

    const trimmed = message.trim();
    console.log(`${logPrefix} Message length: ${trimmed.length} chars`);

    let upstream;
    try {
      upstream = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          instructions: AGENT_SYSTEM_PROMPT,
          input: trimmed,
        }),
      });
    } catch (fetchErr) {
      const details =
        fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      console.error(`${logPrefix} Fetch to OpenAI failed:`, fetchErr);
      return res.status(502).json({
        error: 'Failed to reach OpenAI',
        details,
      });
    }

    const rawText = await upstream.text();
    let data;
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch (parseErr) {
      const details =
        parseErr instanceof Error ? parseErr.message : String(parseErr);
      console.error(
        `${logPrefix} OpenAI returned non-JSON (first 400 chars):`,
        rawText.slice(0, 400),
      );
      return res.status(502).json({
        error: 'Invalid JSON from OpenAI',
        details,
      });
    }

    console.log(`${logPrefix} OpenAI HTTP ${upstream.status}`, {
      ok: upstream.ok,
      dataKeys:
        data && typeof data === 'object' && !Array.isArray(data)
          ? Object.keys(data)
          : typeof data,
    });
    console.log(`${logPrefix} OpenAI response body:`, data);

    if (!upstream.ok) {
      const status =
        upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502;
      return res.status(status).json(
        data && typeof data === 'object'
          ? data
          : { error: 'OpenAI error', raw: data },
      );
    }

    return res.json(data);
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    console.error(`${logPrefix} Unhandled error:`, error);

    if (res.headersSent) {
      console.error(
        `${logPrefix} Response headers already sent; cannot return JSON error`,
      );
      return;
    }

    return res.status(500).json({
      error: 'Something went wrong',
      details,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
