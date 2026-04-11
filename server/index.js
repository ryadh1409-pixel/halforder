import express from 'express';
import 'dotenv/config';

const app = express();

app.use(express.json());

// test route
app.get('/', (req, res) => {
  console.log('GET / hit');
  res.send('Server works');
});

// test chat route
app.post('/chat', (req, res) => {
  console.log('POST /chat hit', req.body);
  res.json({ ok: true });
});

const PORT = 3000;

app.listen(PORT, () => {
  console.log('✅ Server REALLY running on port', PORT);
});
