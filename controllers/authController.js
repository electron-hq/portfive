const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const verifyCaptcha = async (token) => {
  if (!process.env.TURNSTILE_SECRET_KEY || process.env.NODE_ENV === 'development') return true;
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${process.env.TURNSTILE_SECRET_KEY}&response=${token}`
    });
    const data = await response.json();
    return data.success;
  } catch (err) { return false; }
};

const generateTokenAndSetCookie = (res, userId) => {
  const token = jwt.sign({ id: userId }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '7d' });
  res.cookie('portfive_token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 7 * 24 * 60 * 60 * 1000 });
};

const checkUsername = async (req, res) => {
  try {
    const { username } = req.params;
    if (!username || username.length < 3) {
      return res.status(400).json({ available: false, message: 'Username must be at least 3 characters' });
    }
    const existingUser = await User.findOne({ username: username.toLowerCase() });
    if (existingUser) {
      return res.status(200).json({ available: false, message: 'Username is already taken' });
    }
    return res.status(200).json({ available: true, message: 'Username is available' });
  } catch (error) {
    return res.status(500).json({ available: false, message: 'Server error' });
  }
};

const registerUser = async (req, res) => {
  try {
    const { fullName, username, password, captchaToken } = req.body;
    const isCaptchaValid = await verifyCaptcha(captchaToken);
    if (!isCaptchaValid) return res.status(400).json({ message: 'Invalid Captcha' });
    if (!fullName || !username || !password) return res.status(400).json({ message: 'Please provide all fields' });

    const userExists = await User.findOne({ username: username.toLowerCase() });
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

    const user = await User.create({ fullName, username: username.toLowerCase(), password: hashedPassword, recoveryCodes: hashedRecoveryCodes });
    generateTokenAndSetCookie(res, user._id);
    res.status(201).json({ message: 'Registration successful!', user: { id: user._id, fullName: user.fullName, username: user.username }, recoveryCodes: plainRecoveryCodes });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
};

const loginUser = async (req, res) => {
  try {
    const { username, password, captchaToken } = req.body;
    const isCaptchaValid = await verifyCaptcha(captchaToken);
    if (!isCaptchaValid) return res.status(400).json({ message: 'Invalid Captcha' });

    const user = await User.findOne({ username: username.toLowerCase() });
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

    generateTokenAndSetCookie(res, user._id);
    res.status(200).json({ message: 'Login successful', user: { id: user._id, fullName: user.fullName, username: user.username, profilePic: user.profilePic } });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
};

const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.status(200).json({ user: {
      id: user._id, fullName: user.fullName, username: user.username,
      profilePic: user.profilePic, coverPic: user.coverPic, bio: user.bio,
      website: user.website, badge: user.badge, allowAds: user.allowAds, adImpressions: user.adImpressions
    } });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
};

const recoverPassword = async (req, res) => {
  try {
    const { username, recoveryCode, newPassword } = req.body;
    if (!username || !recoveryCode || !newPassword) return res.status(400).json({ message: 'Please provide all fields' });
    const user = await User.findOne({ username: username.toLowerCase() });
    if (!user) return res.status(400).json({ message: 'User not found' });

    let isCodeValid = false;
    let codeIndexToMarkUsed = -1;
    for (let i = 0; i < user.recoveryCodes.length; i++) {
      if (!user.recoveryCodes[i].isUsed) {
        if (await bcrypt.compare(recoveryCode, user.recoveryCodes[i].codeHash)) {
          isCodeValid = true; codeIndexToMarkUsed = i; break;
        }
      }
    }
    if (!isCodeValid) return res.status(400).json({ message: 'Invalid or used code' });

    user.recoveryCodes[codeIndexToMarkUsed].isUsed = true;
    user.password = await bcrypt.hash(newPassword, await bcrypt.genSalt(10));
    await user.save();
    res.status(200).json({ message: 'Password recovered successfully.' });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
};

const logoutUser = (req, res) => {
  res.cookie('portfive_token', '', { maxAge: 1 });
  res.status(200).json({ message: 'Logged out successfully' });
};

module.exports = { registerUser, loginUser, getMe, recoverPassword, logoutUser, checkUsername };
