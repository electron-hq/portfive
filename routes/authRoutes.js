const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { registerUser, loginUser, getMe, recoverPassword, logoutUser, checkUsername } = require('../controllers/authController');
const { protect } = require('../middlewares/authMiddleware');

// Login: Max 10 attempts per 15 min. Don't count successful logins.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  message: { message: 'Too many login attempts, please try again later.' }
});

// Register: Max 5 attempts per 60 min to prevent spam.
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { message: 'Too many requests, please try again later.' }
});

// Recovery: Strict, separate counter from register (per Handoff critical fix)
const recoverLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: false,
  message: { message: 'Too many recovery attempts, please try again later.' }
});

router.post('/register', registerLimiter, registerUser);
router.post('/login', loginLimiter, loginUser);
router.post('/recover', recoverLimiter, recoverPassword);
router.get('/check-username/:username', checkUsername);
router.get('/me', protect, getMe);
router.post('/logout', logoutUser);

module.exports = router;
