const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Helper: Captcha Verify (Cloudflare Turnstile)
const verifyCaptcha = async (token) => {
  if (!process.env.TURNSTILE_SECRET_KEY || process.env.NODE_ENV === 'development') {
    return true; // Skip in dev if no key is set
  }
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${process.env.TURNSTILE_SECRET_KEY}&response=${token}`
    });
    const data = await response.json();
    return data.success;
  } catch (err) {
    return false;
  }
};

// Helper: Generate Token & Set Cookie
const generateTokenAndSetCookie = (res, userId) => {
  const token = jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
  
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  };
  
  res.cookie('portfive_token', token, cookieOptions);
};

// @desc    Register a new user
// @route   POST /api/auth/register
const registerUser = async (req, res) => {
  try {
    const { fullName, username, password, captchaToken } = req.body;

    // 1. Verify Captcha
    const isCaptchaValid = await verifyCaptcha(captchaToken);
    if (!isCaptchaValid) {
      return res.status(400).json({ message: 'Invalid Captcha' });
    }

    // 2. Validate Input
    if (!fullName || !username || !password) {
      return res.status(400).json({ message: 'Please provide all fields' });
    }

    const userExists = await User.findOne({ username: username.toLowerCase() });
    if (userExists) {
      return res.status(400).json({ message: 'Username already taken' });
    }

    // 3. Hash Password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 4. Generate 3 Recovery Codes
    const plainRecoveryCodes = [];
    const hashedRecoveryCodes = [];

    for (let i = 0; i < 3; i++) {
      const code = crypto.randomBytes(8).toString('hex').toUpperCase(); // e.g. A1B2C3D4E5F6G7H8
      plainRecoveryCodes.push(code);
      const codeHash = await bcrypt.hash(code, salt);
      hashedRecoveryCodes.push({ codeHash });
    }

    // 5. Create User
    const user = await User.create({
      fullName,
      username: username.toLowerCase(),
      password: hashedPassword,
      recoveryCodes: hashedRecoveryCodes
    });

    if (user) {
      generateTokenAndSetCookie(res, user._id);
      res.status(201).json({
        message: 'Registration successful!',
        user: { id: user._id, fullName: user.fullName, username: user.username },
        recoveryCodes: plainRecoveryCodes // Send plain codes to frontend to download as .txt
      });
    } else {
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
const loginUser = async (req, res) => {
  try {
    const { username, password, captchaToken } = req.body;

    // 1. Verify Captcha
    const isCaptchaValid = await verifyCaptcha(captchaToken);
    if (!isCaptchaValid) {
      return res.status(400).json({ message: 'Invalid Captcha' });
    }

    // 2. Find User
    const user = await User.findOne({ username: username.toLowerCase() });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // 3. Check Password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // 4. Login Success
    generateTokenAndSetCookie(res, user._id);
    res.status(200).json({
      message: 'Login successful',
      user: { id: user._id, fullName: user.fullName, username: user.username, profilePic: user.profilePic }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Recover Password using Recovery Code
// @route   POST /api/auth/recover
const recoverPassword = async (req, res) => {
  try {
    const { username, recoveryCode, newPassword } = req.body;

    if (!username || !recoveryCode || !newPassword) {
      return res.status(400).json({ message: 'Please provide all fields' });
    }

    const user = await User.findOne({ username: username.toLowerCase() });
    if (!user) {
      return res.status(400).json({ message: 'User not found' });
    }

    // Check recovery codes
    let isCodeValid = false;
    let codeIndexToMarkUsed = -1;

    for (let i = 0; i < user.recoveryCodes.length; i++) {
      const rc = user.recoveryCodes[i];
      if (!rc.isUsed) {
        const match = await bcrypt.compare(recoveryCode, rc.codeHash);
        if (match) {
          isCodeValid = true;
          codeIndexToMarkUsed = i;
          break;
        }
      }
    }

    if (!isCodeValid) {
      return res.status(400).json({ message: 'Invalid or already used recovery code' });
    }

    // Mark code as used
    user.recoveryCodes[codeIndexToMarkUsed].isUsed = true;

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);

    await user.save();
    res.status(200).json({ message: 'Password recovered successfully. You can now login.' });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Logout user
// @route   POST /api/auth/logout
const logoutUser = (req, res) => {
  res.cookie('portfive_token', '', { maxAge: 1 });
  res.status(200).json({ message: 'Logged out successfully' });
};

module.exports = { registerUser, loginUser, recoverPassword, logoutUser };
