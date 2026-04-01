require('dotenv').config();
console.log('ENV KEY:', process.env.OPENAI_API_KEY ? 'LOADED' : 'MISSING');

const express = require('express');
const app = express();

app.use(express.json());

const chatRouter = require('./server/chat');

app.use('/chat', chatRouter);

app.listen(3000, () => {
  console.log('MAIN SERVER RUNNING');
  console.log('Server running on port 3000');
});
