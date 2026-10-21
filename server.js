require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// App Initialization
const app = express();

// Security & Middlewares
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Global Rate Limiter
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
  message: { message: "Too many requests from this IP, please try again later." }
});
app.use('/api/', globalLimiter);

// Static Files (Frontend PWA)
app.use(express.static(path.join(__dirname, 'public')));

// ================= DATABASE CONNECTION =================
// (আমরা পরবর্তী ধাপে config/db.js ফাইলে এটি সুন্দরভাবে সাজাবো)
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('✅ MongoDB Connected to PortFive'))
  .catch((err) => console.log('❌ MongoDB Connection Error:', err));

// ================= ROUTES =================
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'active', message: 'PortFive API is running smoothly.' });
});

// Fallback for SPA (If any route doesn't match, send index.html)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ================= SERVER START =================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 PortFive Server running on port ${PORT}`);
});
