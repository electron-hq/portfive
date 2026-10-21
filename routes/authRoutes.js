const express = require('express');
const router = express.Router();
const { registerUser, loginUser, getMe, recoverPassword, logoutUser, checkUsername } = require('../controllers/authController');
const { protect } = require('../middlewares/authMiddleware');

router.get('/check-username/:username', checkUsername);
router.post('/register', registerUser);
router.post('/login', loginUser);
router.get('/me', protect, getMe);
router.post('/recover', recoverPassword);
router.post('/logout', logoutUser);

module.exports = router;
