const express = require('express');
const router = express.Router();
const multer = require('multer');
const { protect } = require('../middlewares/authMiddleware');
const { sendMessage, getConversations, getMessages, getChatImage, editMessage, deleteMessage, getUnreadCount } = require('../controllers/chatController');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
const handleUpload = upload.single('media');

router.post('/send', protect, (req, res, next) => { handleUpload(req, res, (err) => { if (err) return res.status(400).json({ message: err.message }); next(); }); }, sendMessage);
router.get('/conversations', protect, getConversations);
router.get('/messages/:userId', protect, getMessages);
router.get('/image/:messageId', protect, getChatImage);
router.put('/message/:messageId', protect, editMessage);
router.delete('/message/:messageId', protect, deleteMessage);
router.get('/unread-count', protect, getUnreadCount);

module.exports = router;
