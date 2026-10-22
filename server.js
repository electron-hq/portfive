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

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, credentials: true } });

// FIX: Tell Express to trust the Render proxy
app.set('trust proxy', 1);

connectDB();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const globalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 1000, message: { message: "Too many requests" } });
app.use('/api/', globalLimiter);

app.get('/', (req, res) => {
  const token = req.cookies.portfive_token;
  if (token) { try { jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret'); return res.redirect('/home.html'); } catch (err) { res.clearCookie('portfive_token'); } }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

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

io.on('connection', (socket) => {
  socket.on('join_room', (userId) => {
    socket.join(userId);
    socket.userId = userId;
  });
  
  socket.on('send_message', (data) => io.to(data.receiverId).emit('receive_message', data.message));
  socket.on('edit_message', (data) => io.to(data.receiverId).emit('message_edited', { messageId: data.messageId, newText: data.newText }));
  socket.on('delete_message', (data) => io.to(data.receiverId).emit('message_deleted', { messageId: data.messageId }));
  socket.on('send_notification', (data) => io.to(data.recipientId).emit('receive_notification', data.notification));

  socket.on('call_user', async (data) => {
    io.to(data.receiverId).emit('incoming_call', { from: data.from, signal: data.signal, type: data.type });
    try {
      const sender = await User.findById(data.from).select('fullName');
      if (sender) {
        sendPushNotification(data.receiverId, {
          title: 'Incoming Call',
          body: `${sender.fullName} is calling you (${data.type} call)...`,
          url: `/chat-room.html?id=${data.from}`
        });
      }
    } catch (err) { console.error('Call push notify error:', err); }
  });

  socket.on('answer_call', (data) => { io.to(data.callerId).emit('call_accepted', { signal: data.signal }); });
  socket.on('ice_candidate', (data) => { io.to(data.receiverId).emit('ice_candidate', { candidate: data.candidate }); });
  socket.on('reject_call', (data) => { io.to(data.callerId).emit('call_rejected'); });
  socket.on('end_call', (data) => { io.to(data.receiverId).emit('call_ended'); });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
