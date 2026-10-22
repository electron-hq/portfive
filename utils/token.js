const jwt = require('jsonwebtoken');

// Fallback secret is dangerous. Crash immediately if missing.
if (!process.env.JWT_SECRET) {
  console.error('FATAL ERROR: JWT_SECRET is not defined in .env');
  process.exit(1);
}

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax', // 'strict' breaks external links, 'lax' is good balance
  path: '/'
};

const setAuthCookie = (res, user) => {
  const token = jwt.sign(
    { id: user._id, tv: user.tokenVersion || 0 },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
  res.cookie('portfive_token', token, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 });
};

const clearAuthCookie = (res) => {
  res.clearCookie('portfive_token', cookieOptions);
};

module.exports = { setAuthCookie, clearAuthCookie };
