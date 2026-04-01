const express = require('express');
const router = express.Router();

router.post('/', (req, res) => {
  const { message } = req.body;

  res.json({
    ok: true,
    response: 'AI says: ' + message
  });
});

module.exports = router;
