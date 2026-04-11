const express = require('express');

const app = express();

app.use(express.json());

// TEST ROUTE
app.get('/', (req, res) => {
  console.log('GET / hit');
  res.send('Server works');
});

// TEST CHAT ROUTE
app.post('/chat', (req, res) => {
  console.log('POST /chat hit', req.body);
  res.json({ ok: true });
});

// START SERVER
app.listen(3000, () => {
  console.log('🔥 Server REALLY running on port 3000');
});
