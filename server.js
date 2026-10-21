require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/db');

// Initialize App
const app = express();

// Connect to Database
connectDB();

// Security & Middlewares
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Global Rate Limiter
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: { message: "Too many requests from this IP, please try again later." }
});
app.use('/api/', globalLimiter);

// Static Files (Frontend PWA)
app.use(express.static(path.join(__dirname, 'public')));

// ================= ROUTES =================
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'active', message: 'PortFive API is running.' });
});

// Fallback for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 PortFive Server running on port ${PORT}`);
});
