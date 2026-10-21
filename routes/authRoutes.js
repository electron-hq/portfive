const express = require('express');
const router = express.Router();
const { registerUser, loginUser, recoverPassword, logoutUser } = require('../controllers/authController');

router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/recover', recoverPassword);
router.post('/logout', logoutUser);

module.exports = router;
