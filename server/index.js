require('dotenv').config();

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const Stripe = require('stripe');

/**
 * Google Places API (New) — searchText. Returns raw `places` or [] on failure.
 */
async function searchPlaces(query) {
  if (!query || !String(query).trim()) {
    return [];
  }

  if (!process.env.GOOGLE_MAPS_API_KEY) {
    console.warn('GOOGLE_MAPS_API_KEY is not set; skipping Places search.');
    return [];
  }

  try {
    const res = await fetch(
      'https://places.googleapis.com/v1/places:searchText',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY,
          'X-Goog-FieldMask':
            'places.displayName,places.formattedAddress',
        },
        body: JSON.stringify({
          textQuery: String(query).trim(),
        }),
      },
    );

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error(
        'Places API (New) error:',
        res.status,
        data?.error?.message || JSON.stringify(data).slice(0, 300),
      );
      return [];
    }

    return data.places || [];
  } catch (err) {
    console.error('searchPlaces:', err instanceof Error ? err.message : err);
    return [];
  }
}

const app = express();

app.use(cors());
app.use(express.json());

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');
console.log(
  'Stripe key loaded:',
  process.env.STRIPE_SECRET_KEY ? 'YES' : 'NO',
);

app.get('/', (req, res) => {
  console.log('GET / hit');
  res.send('Server works');
});

app.post('/create-checkout-session', async (req, res) => {
  try {
    const { amount, orderId } = req.body || {};
    const parsedAmount = Number(amount);
    console.log('[stripe] request body:', { amount, orderId });

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }
    if (!orderId || typeof orderId !== 'string') {
      return res.status(400).json({ error: 'Invalid orderId' });
    }
    if (!stripe) {
      return res.status(500).json({ error: 'Stripe server not configured' });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'cad',
            product_data: {
              name: 'HalfOrder Payment',
            },
            unit_amount: Math.round(parsedAmount * 100),
          },
          quantity: 1,
        },
      ],
      success_url: 'https://example.com/success',
      cancel_url: 'https://example.com/cancel',
      metadata: { orderId },
    });

    console.log('[stripe] session created:', {
      id: session.id,
      hasUrl: Boolean(session.url),
      orderId,
    });
    return res.json({ url: session.url });
  } catch (error) {
    console.error('[stripe] create-checkout-session error:', error);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

app.post('/create-payment-intent', async (req, res) => {
  try {
    const { amount } = req.body || {};
    console.log('[stripe] create-payment-intent request:', { amount });

    if (!amount) {
      return res.status(400).json({ error: 'Amount is required' });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount,
      currency: 'cad',
      automatic_payment_methods: { enabled: true },
    });

    return res.json({
      clientSecret: paymentIntent.client_secret,
    });
  } catch (error) {
    console.error('Stripe error:', error?.message || error);
    return res.status(500).json({ error: error?.message || 'Stripe failed' });
  }
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

app.post('/chat', async (req, res) => {
  try {
    const { message: userMessage } = req.body;

    if (!userMessage) {
      return res.status(400).json({ reply: 'No message', places: [] });
    }

    if (!process.env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY is not set');
      return res.status(500).json({
        reply:
          'OPENAI_API_KEY is not set. Add it to .env (see .env.example).',
        places: [],
      });
    }

    console.log('User:', userMessage);

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

User message: ${userMessage}
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
      return res.status(status).json({ reply: errText, places: [] });
    }

    const aiText =
      data?.output?.[0]?.content?.[0]?.text || 'No response';

    console.log('Clean AI:', aiText);

    let parsed;
    try {
      parsed = JSON.parse(aiText);
    } catch {
      parsed = {
        food: aiText,
        category: 'unknown',
        searchQuery: userMessage,
      };
    }

    const base =
      parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed
        : {
            food: String(aiText),
            category: 'unknown',
            searchQuery: userMessage,
          };

    const sq =
      typeof base.searchQuery === 'string'
        ? base.searchQuery.trim()
        : '';
    const query = sq || userMessage;
    const placesRaw = await searchPlaces(query);

    return res.json({
      reply: aiText,
      places: placesRaw.slice(0, 5),
    });
  } catch (err) {
    console.error(err);
    const errMsg = err instanceof Error ? err.message : String(err);
    console.log('Clean AI:', errMsg);
    return res.status(500).json({ reply: errMsg, places: [] });
  }
});

app.listen(3000, () => {
  console.log('🔥 Server REALLY running on port 3000');
});
