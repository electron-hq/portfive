const Message = require('../models/Message');
const User = require('../models/User');
const Notification = require('../models/Notification');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');
const { sendPushNotification } = require('./pushController');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const uploadBufferToImgBB = async (buffer, filename) => {
  const apiKey = process.env.IMGBB_API_KEY;
  const form = new FormData();
  form.append('image', buffer.toString('base64'));
  if (filename) form.append('name', filename);
  const response = await fetch('https://api.imgbb.com/1/upload?key=' + encodeURIComponent(apiKey), { method: 'POST', body: form });
  const data = await response.json();
  return data.data.url;
};

const uploadAudioToCloudinary = (buffer) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { resource_type: 'video', folder: 'portfive_chats' },
      (error, result) => error ? reject(error) : resolve(result.secure_url)
    );
    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
};

const checkBlockStatus = async (userId1, userId2) => {
  const user1 = await User.findById(userId1).select('blockedUsers following');
  const user2 = await User.findById(userId2).select('blockedUsers following');
  if (!user1 || !user2) return { isBlocked: true, isMutual: false };
  
  const isBlocked = user1.blockedUsers.includes(userId2) || user2.blockedUsers.includes(userId1);
  const isMutual = user1.following.includes(userId2) && user2.following.includes(userId1);
  
  return { isBlocked, isMutual };
};

const sendMessage = async (req, res) => {
  try {
    const { receiverId, text } = req.body;
    const { isBlocked, isMutual } = await checkBlockStatus(req.user.id, receiverId);

    if (isBlocked) return res.status(403).json({ message: 'You cannot message this user.' });
    if (!isMutual) return res.status(403).json({ message: 'You must mutually follow each other to chat.' });

    let imageUrl = '', audioUrl = '';
    if (req.file) {
      if (req.file.mimetype.startsWith('image/')) imageUrl = await uploadBufferToImgBB(req.file.buffer, 'chat-' + req.user.id + '-' + Date.now());
      else audioUrl = await uploadAudioToCloudinary(req.file.buffer);
    }
    
    const message = await Message.create({ sender: req.user.id, receiver: receiverId, text: text ? text.trim() : '', imageUrl, audioUrl });
    const populated = await message.populate([{ path: 'sender', select: 'fullName username profilePic' }, { path: 'receiver', select: 'fullName username profilePic' }]);
    const populatedObj = populated.toObject();
    if (populatedObj.imageUrl) populatedObj.imageUrl = `/api/chat/image/${populatedObj._id}`;

    const sender = populatedObj.sender;
    let previewText = text ? text.trim() : (imageUrl ? 'Sent an image' : 'Sent a voice message');
    if (previewText.length > 40) previewText = previewText.substring(0, 40) + '...';

    await Notification.create({ receiver: receiverId, sender: req.user.id, type: 'message', text: previewText });
    
    sendPushNotification(receiverId, {
      title: `New Message from ${sender.fullName}`,
      body: previewText,
      url: `/chat-room.html?id=${req.user.id}`
    });

    res.status(201).json(populatedObj);
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
};

const getConversations = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId).select('blockedUsers');
    const blockedIds = user.blockedUsers.map(id => id.toString());

    const messages = await Message.find({ $or: [{ sender: userId }, { receiver: userId }] })
      .sort({ createdAt: -1 }).populate('sender', 'fullName username profilePic').populate('receiver', 'fullName username profilePic').lean();
      
    const conversations = new Map();
    messages.forEach(msg => {
      if (!msg.sender || !msg.receiver) return;
      const isSender = msg.sender._id.toString() === userId;
      const otherUser = isSender ? msg.receiver : msg.sender;
      const otherId = otherUser._id.toString();

      if (blockedIds.includes(otherId)) return; // Skip blocked users

      let lastMsgText = msg.text;
      if (msg.imageUrl && !lastMsgText) lastMsgText = '[Image]';
      if (msg.audioUrl && !lastMsgText) lastMsgText = '[Voice Message]';
      
      if (!conversations.has(otherId)) {
        conversations.set(otherId, { user: otherUser, lastMessage: lastMsgText, unreadCount: (!isSender && !msg.isRead) ? 1 : 0, timestamp: msg.createdAt });
      } else if (!isSender && !msg.isRead) conversations.get(otherId).unreadCount++;
    });
    res.status(200).json(Array.from(conversations.values()));
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
};

const getMessages = async (req, res) => {
  try {
    const userId = req.user.id, targetId = req.params.userId;
    const { isBlocked, isMutual } = await checkBlockStatus(userId, targetId);

    if (isBlocked) return res.status(403).json({ message: 'Chat locked due to block.' });
    if (!isMutual) return res.status(403).json({ message: 'You must mutually follow each other to view chats.' });

    await Message.updateMany({ sender: targetId, receiver: userId, isRead: false }, { $set: { isRead: true } });
    await Notification.updateMany({ receiver: userId, sender: targetId, type: 'message', isRead: false }, { $set: { isRead: true } });

    const messages = await Message.find({ $or: [{ sender: userId, receiver: targetId }, { sender: targetId, receiver: userId }] })
      .sort({ createdAt: 1 }).populate('sender', 'fullName username profilePic').populate('receiver', 'fullName username profilePic').lean();
    const secureMessages = messages.map(msg => { if (msg.imageUrl) msg.imageUrl = `/api/chat/image/${msg._id}`; return msg; });
    res.status(200).json(secureMessages);
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
};

const getChatImage = async (req, res) => {
  try {
    const msg = await Message.findById(req.params.messageId);
    if (!msg || !msg.imageUrl) return res.status(404).send('Image not found');
    if (msg.sender.toString() !== req.user.id && msg.receiver.toString() !== req.user.id) return res.status(403).send('Unauthorized');
    const response = await fetch(msg.imageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const arrayBuffer = await response.arrayBuffer();
    res.setHeader('Content-Type', response.headers.get('content-type') || 'image/jpeg');
    res.send(Buffer.from(arrayBuffer));
  } catch (error) { res.status(500).send('Server error'); }
};

const editMessage = async (req, res) => {
  try {
    const msg = await Message.findById(req.params.messageId);
    if (!msg || msg.sender.toString() !== req.user.id) return res.status(403).json({ message: 'Not authorized' });
    msg.text = req.body.text.trim(); msg.isEdited = true; await msg.save();
    res.status(200).json({ message: 'Message edited', newText: msg.text, isEdited: true });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
};

const deleteMessage = async (req, res) => {
  try {
    const msg = await Message.findById(req.params.messageId);
    if (!msg || msg.sender.toString() !== req.user.id) return res.status(403).json({ message: 'Not authorized' });
    await Message.findByIdAndDelete(req.params.messageId);
    res.status(200).json({ message: 'Message deleted' });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
};

const getUnreadCount = async (req, res) => {
  try {
    const count = await Message.countDocuments({ receiver: req.user.id, isRead: false });
    res.status(200).json({ count });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
};

module.exports = { sendMessage, getConversations, getMessages, getChatImage, editMessage, deleteMessage, getUnreadCount };
