const jwt = require('jsonwebtoken');

const protect = (req, res, next) => {
  const token = req.cookies.portfive_token;

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.clearCookie('portfive_token');
    res.status(401).json({ message: 'Not authorized, token failed' });
  }
};

module.exports = { protect };
