const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const { subscribe } = require('../controllers/pushController');

// Public route to get the VAPID key for the frontend
router.get('/vapid-public-key', (req, res) => {
  res.status(200).json({ key: process.env.VAPID_PUBLIC_KEY });
});

router.post('/subscribe', protect, subscribe);

module.exports = router;
