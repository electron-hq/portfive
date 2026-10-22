const User = require('../models/User');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { setAuthCookie, clearAuthCookie } = require('../utils/token');

const verifyCaptcha = async (token) => {
  if (!process.env.TURNSTILE_SECRET_KEY) {
    // SECURITY FIX: Only bypass in dev. In production, fail closed.
    if (process.env.NODE_ENV === 'production') {
      console.error('❌ TURNSTILE_SECRET_KEY is missing in production!');
      return false; 
    }
    console.warn('⚠️ TURNSTILE_SECRET_KEY missing. Bypassing in dev.');
    return true;
  }
  if (!token) return false;

  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret: process.env.TURNSTILE_SECRET_KEY,
        response: token
      })
    });
    const data = await response.json();
    return data.success;
  } catch (err) {
    return false;
  }
};

const checkUsername = async (req, res) => {
  try {
    const { username } = req.params;
    if (!username || username.length < 3) return res.status(400).json({ available: false, message: 'Username must be at least 3 characters' });

    const existingUser = await User.findOne({ username: username.toLowerCase() });
    if (existingUser) return res.status(200).json({ available: false, message: 'Username is already taken' });

    return res.status(200).json({ available: true, message: 'Username is available' });
  } catch (error) {
    return res.status(500).json({ available: false, message: 'Server error' });
  }
};

const registerUser = async (req, res) => {
  try {
    const { fullName, username, password, captchaToken } = req.body;

    // 1. Input Type Validation FIRST (Save Cloudflare API calls)
    if ([fullName, username, password].some(v => typeof v !== 'string')) {
      return res.status(400).json({ message: 'Invalid input types' });
    }

    const trimmedName = fullName.trim();
    const trimmedUser = username.trim();

    if (!trimmedName || !trimmedUser || !password) {
      return res.status(400).json({ message: 'Please provide all fields' });
    }
    if (password.length < 8 || password.length > 72) {
      return res.status(400).json({ message: 'Password must be 8-72 characters' });
    }
    if (!/^[a-z0-9_]{3,20}$/i.test(trimmedUser)) {
      return res.status(400).json({ message: 'Username must be 3-20 characters (letters, numbers, underscores only)' });
    }

    // 2. Captcha Verification SECOND
    const isCaptchaValid = await verifyCaptcha(captchaToken);
    if (!isCaptchaValid) return res.status(400).json({ message: 'Captcha verification failed. Please try again.' });

    const userExists = await User.findOne({ username: trimmedUser.toLowerCase() });
    if (userExists) return res.status(400).json({ message: 'Username already taken' });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const plainRecoveryCodes = [];
    const hashedRecoveryCodes = [];
    for (let i = 0; i < 3; i++) {
      const code = crypto.randomBytes(8).toString('hex').toUpperCase();
      plainRecoveryCodes.push(code);
      hashedRecoveryCodes.push({ codeHash: await bcrypt.hash(code, salt) });
    }

    const user = await User.create({
      fullName: trimmedName,
      username: trimmedUser.toLowerCase(),
      password: hashedPassword,
      recoveryCodes: hashedRecoveryCodes
    });

    setAuthCookie(res, user);
    res.status(201).json({
      message: 'Registration successful!',
      user: { id: user._id, fullName: user.fullName, username: user.username },
      recoveryCodes: plainRecoveryCodes
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const loginUser = async (req, res) => {
  try {
    const { username, password, captchaToken } = req.body;

    if (typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ message: 'Invalid credentials format' });
    }

    const isCaptchaValid = await verifyCaptcha(captchaToken);
    if (!isCaptchaValid) return res.status(400).json({ message: 'Captcha verification failed. Please try again.' });

    const user = await User.findOne({ username: username.toLowerCase().trim() });
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

    setAuthCookie(res, user);
    res.status(200).json({
      message: 'Login successful',
      user: { id: user._id, fullName: user.fullName, username: user.username, profilePic: user.profilePic }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.status(200).json({
      user: {
        id: user._id,
        fullName: user.fullName,
        username: user.username,
        profilePic: user.profilePic,
        coverPic: user.coverPic,
        bio: user.bio,
        website: user.website,
        badge: user.badge,
        allowAds: user.allowAds,
        allowAdsPens: user.allowAdsPens,
        allowAdsImages: user.allowAdsImages,
        adImpressions: user.adImpressions
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

const recoverPassword = async (req, res) => {
  try {
    const { username, recoveryCode, newPassword } = req.body;
    if (typeof username !== 'string' || typeof recoveryCode !== 'string' || typeof newPassword !== 'string') {
      return res.status(400).json({ message: 'Invalid input types' });
    }
    if (newPassword.length < 8 || newPassword.length > 72) {
      return res.status(400).json({ message: 'Password must be 8-72 characters' });
    }

    const user = await User.findOne({ username: username.toLowerCase().trim() });
    if (!user) return res.status(400).json({ message: 'User not found' });

    let isCodeValid = false;
    let codeIndexToMarkUsed = -1;

    for (let i = 0; i < user.recoveryCodes.length; i++) {
      if (!user.recoveryCodes[i].isUsed) {
        if (await bcrypt.compare(recoveryCode, user.recoveryCodes[i].codeHash)) {
          isCodeValid = true;
          codeIndexToMarkUsed = i;
          break;
        }
      }
    }

    if (!isCodeValid) return res.status(400).json({ message: 'Invalid or used code' });

    user.recoveryCodes[codeIndexToMarkUsed].isUsed = true;
    user.password = await bcrypt.hash(newPassword, await bcrypt.genSalt(10));
    user.tokenVersion = (user.tokenVersion || 0) + 1; // Invalidate existing sessions
    await user.save();

    res.status(200).json({ message: 'Password recovered successfully. Please login.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

const logoutUser = (req, res) => {
  clearAuthCookie(res);
  res.status(200).json({ message: 'Logged out successfully' });
};

module.exports = { registerUser, loginUser, getMe, recoverPassword, logoutUser, checkUsername };
