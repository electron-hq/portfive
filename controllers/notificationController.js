const Notification = require('../models/Notification');

// @desc    Get user notifications
// @route   GET /api/notifications
const getNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ receiver: req.user.id })
      .populate('sender', 'fullName username profilePic')
      .populate('postId', 'mediaUrl postType title')
      .sort({ createdAt: -1 })
      .lean();
    res.status(200).json(notifications);
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Mark notifications as read
// @route   PUT /api/notifications/read
const markAsRead = async (req, res) => {
  try {
    await Notification.updateMany({ receiver: req.user.id, isRead: false }, { $set: { isRead: true } });
    res.status(200).json({ message: 'Marked as read' });
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { getNotifications, markAsRead };
