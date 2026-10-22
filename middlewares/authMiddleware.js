const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { clearAuthCookie } = require('../utils/token');

const protect = async (req, res, next) => {
  const token = req.cookies.portfive_token;
  if (!token) return res.status(401).json({ message: 'Not authorized, no token' });

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    clearAuthCookie(res);
    return res.status(401).json({ message: 'Not authorized, token failed' });
  }

  try {
    const user = await User.findById(decoded.id).select('tokenVersion');
    // Check if user still exists and tokenVersion matches (Session Invalidation)
    if (!user || (decoded.tv ?? 0) !== (user.tokenVersion ?? 0)) {
      clearAuthCookie(res);
      return res.status(401).json({ message: 'Session expired, please login again' });
    }
    
    req.user = { id: decoded.id };
    next();
  } catch (error) {
    // Return 500 on DB error so user doesn't get logged out on network hiccups
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { protect };
