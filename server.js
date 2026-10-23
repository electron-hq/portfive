require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const connectDB = require('./config/db');
const http = require('http');
const { Server } = require('socket.io');

const User = require('./models/User');
const { sendPushNotification } = require('./controllers/pushController');
const { clearAuthCookie } = require('./utils/token');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, credentials: true } });

app.set('trust proxy', 1);

connectDB();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const globalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 1000, message: { message: "Too many requests" } });
app.use('/api/', globalLimiter);

app.get('/', (req, res) => {
  const token = req.cookies.portfive_token;
  if (token) {
    try {
      jwt.verify(token, process.env.JWT_SECRET);
      return res.redirect('/home.html');
    } catch (err) {
      clearAuthCookie(res);
    }
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

// TURN credentials from env (moved out of frontend)
const TURN_URLS = (process.env.TURN_URLS || '').split(',').map(s => s.trim()).filter(Boolean);
const TURN_USERNAME = process.env.TURN_USERNAME || '';
const TURN_PASSWORD = process.env.TURN_PASSWORD || '';

function buildIceServers() {
  const servers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ];
  if (TURN_URLS.length > 0 && TURN_USERNAME && TURN_PASSWORD) {
    TURN_URLS.forEach(url => {
      servers.push({ urls: url, username: TURN_USERNAME, credential: TURN_PASSWORD });
    });
  }
  return servers;
}

app.get('/api/turn-credentials', (req, res) => {
  const token = req.cookies.portfive_token;
  if (!token) return res.status(401).json({ message: 'Authentication required' });
  try {
    jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ message: 'Invalid session' });
  }
  res.json({ iceServers: buildIceServers() });
});

const authRoutes = require('./routes/authRoutes');
const postRoutes = require('./routes/postRoutes');
const userRoutes = require('./routes/userRoutes');
const jobRoutes = require('./routes/jobRoutes');
const chatRoutes = require('./routes/chatRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const pushRoutes = require('./routes/pushRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/users', userRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/push', pushRoutes);

app.get('/api/health', (req, res) => res.status(200).send('OK'));
app.use((req, res) => res.status(404).send('404 Not Found'));

// Socket JWT auth middleware
io.use((socket, next) => {
  try {
    const cookies = socket.handshake.headers.cookie || '';
    const match = cookies.split(';').map(s => s.trim()).find(c => c.startsWith('portfive_token='));
    if (!match) return next(new Error('Authentication required'));
    const token = decodeURIComponent(match.substring('portfive_token='.length));
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = String(decoded.id);
    next();
  } catch (err) {
    next(new Error('Authentication failed'));
  }
});

io.on('connection', (socket) => {
  socket.join(socket.userId);

  // Backward compat: ignore client-supplied userId
  socket.on('join_room', () => { socket.join(socket.userId); });

  socket.on('send_message', (data) => {
    if (!data || !data.receiverId || !data.message) return;
    io.to(String(data.receiverId)).emit('receive_message', data.message);
  });

  socket.on('edit_message', (data) => {
    if (!data || !data.receiverId) return;
    io.to(String(data.receiverId)).emit('message_edited', { messageId: data.messageId, newText: data.newText });
  });

  socket.on('delete_message', (data) => {
    if (!data || !data.receiverId) return;
    io.to(String(data.receiverId)).emit('message_deleted', { messageId: data.messageId });
  });

  socket.on('send_notification', (data) => {
    if (!data || !data.recipientId) return;
    io.to(String(data.recipientId)).emit('receive_notification', data.notification);
  });

  socket.on('call_user', async (data) => {
    if (!data || !data.receiverId || !data.signal) return;
    const fromId = socket.userId;
    io.to(String(data.receiverId)).emit('incoming_call', { from: fromId, signal: data.signal, type: data.type });
    try {
      const sender = await User.findById(fromId).select('fullName');
      if (sender) {
        sendPushNotification(data.receiverId, {
          title: 'Incoming Call',
          body: `${sender.fullName} is calling you (${data.type} call)...`,
          url: `/chat-room.html?id=${fromId}`
        });
      }
    } catch (err) { console.error('Call push notify error:', err); }
  });

  socket.on('answer_call', (data) => {
    if (!data || !data.callerId || !data.signal) return;
    io.to(String(data.callerId)).emit('call_accepted', { signal: data.signal });
  });

  socket.on('ice_candidate', (data) => {
    if (!data || !data.receiverId || !data.candidate) return;
    io.to(String(data.receiverId)).emit('ice_candidate', { candidate: data.candidate });
  });

  socket.on('reject_call', (data) => {
    if (!data || !data.callerId) return;
    io.to(String(data.callerId)).emit('call_rejected');
  });

  socket.on('end_call', (data) => {
    if (!data || !data.receiverId) return;
    io.to(String(data.receiverId)).emit('call_ended');
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
