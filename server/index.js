require('dotenv').config();

const axios = require('axios');
const express = require('express');
const fetch = require('node-fetch');

/**
 * Google Places Text Search — up to 5 results with photo URLs.
 */
async function searchPlaces(query) {
  const key = process.env.GOOGLE_API_KEY;
  if (!key || !query || !String(query).trim()) {
    return [];
  }

  const url = 'https://maps.googleapis.com/maps/api/place/textsearch/json';

  try {
    const res = await axios.get(url, {
      params: {
        query: String(query).trim(),
        key,
      },
    });

    const data = res.data;
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.error('Places API:', data.status, data.error_message || '');
      return [];
    }

    const results = Array.isArray(data.results) ? data.results : [];

    return results.slice(0, 5).map((place) => ({
      name: place.name,
      address: place.formatted_address,
      rating: place.rating,
      location: place.geometry?.location ?? null,
      photo: place.photos?.[0]
        ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${place.photos[0].photo_reference}&key=${key}`
        : null,
    }));
  } catch (err) {
    console.error('searchPlaces:', err instanceof Error ? err.message : err);
    return [];
  }
}

const app = express();

app.use(express.json());

// TEST ROUTE
app.get('/', (req, res) => {
  console.log('GET / hit');
  res.send('Server works');
});

function replyFromOpenAiError(data) {
  if (!data || typeof data !== 'object') return 'OpenAI request failed';
  if (typeof data.error === 'string') return data.error;
  if (
    data.error &&
    typeof data.error === 'object' &&
    typeof data.error.message === 'string'
  ) {
    return data.error.message;
  }
  return 'OpenAI request failed';
}

// CHAT — OpenAI Responses API → structured JSON { food, category, searchQuery }
app.post('/chat', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ reply: 'No message' });
    }

    if (!process.env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY is not set');
      return res.status(500).json({
        reply:
          'OPENAI_API_KEY is not set. Add it to .env (see .env.example).',
      });
    }

    console.log('User:', message);

    const prompt = `
You are a food assistant.

Return ONLY JSON.

Extract:
- food
- category
- searchQuery

Example:
{
  "food": "pizza",
  "category": "fast food",
  "searchQuery": "pizza near me"
}

User message: ${message}
`;

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        input: prompt,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      const errText = replyFromOpenAiError(data);
      console.log('Clean AI:', errText);
      const status =
        response.status >= 400 && response.status < 600
          ? response.status
          : 502;
      return res.status(status).json({ reply: errText });
    }

    const text =
      data?.output?.[0]?.content?.[0]?.text || 'No response';

    console.log('Clean AI:', text);

    let parsed;

    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = {
        food: text,
        category: 'unknown',
        searchQuery: `${text} near me`,
      };
    }

    const base =
      parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed
        : {
            food: String(text),
            category: 'unknown',
            searchQuery: `${text} near me`,
          };

    const q =
      typeof base.searchQuery === 'string'
        ? base.searchQuery
        : String(base.searchQuery ?? '');

    const places = await searchPlaces(q);

    return res.json({
      ...base,
      places,
    });
  } catch (err) {
    console.error(err);
    const errMsg = err instanceof Error ? err.message : String(err);
    console.log('Clean AI:', errMsg);
    return res.status(500).json({ reply: errMsg });
  }
});

// START SERVER
app.listen(3000, () => {
  console.log('🔥 Server REALLY running on port 3000');
});
