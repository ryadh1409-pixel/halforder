require('dotenv').config();

const express = require('express');
const Stripe = require('stripe');

const app = express();
app.use(express.json());

const stripeKey = process.env.STRIPE_SECRET_KEY;
if (!stripeKey) {
  console.warn('STRIPE_SECRET_KEY is not set.');
}
const stripe = new Stripe(stripeKey || '', { apiVersion: '2024-06-20' });

app.post('/create-checkout-session', async (req, res) => {
  try {
    const { amount, orderId } = req.body || {};
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }
    if (!orderId || typeof orderId !== 'string') {
      return res.status(400).json({ error: 'Invalid orderId' });
    }
    if (!stripeKey) {
      return res.status(500).json({ error: 'Stripe server is not configured' });
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
      metadata: {
        orderId,
      },
    });

    return res.json({ url: session.url });
  } catch (error) {
    console.error('Stripe checkout error:', error);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

const PORT = Number(process.env.STRIPE_PORT || 3001);
app.listen(PORT, () => {
  console.log(`Stripe server running on http://localhost:${PORT}`);
});
