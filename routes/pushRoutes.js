const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const { subscribe, unsubscribe } = require('../controllers/pushController');

router.get('/vapid-public-key', (req, res) => {
  res.status(200).json({ key: process.env.VAPID_PUBLIC_KEY });
});

router.post('/subscribe', protect, subscribe);
router.post('/unsubscribe', protect, unsubscribe);

module.exports = router;
