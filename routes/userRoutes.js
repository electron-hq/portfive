const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const User = require('../models/User');

// @desc    Get Top 10 Suggested Users
router.get('/suggested', protect, async (req, res) => {
  try {
    const users = await User.find({ _id: { $ne: req.user.id } })
      .select('fullName username profilePic')
      .limit(10)
      .lean();
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// @desc    Get user's followers (Friends tab)
router.get('/friends/:userId', protect, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
      .populate('followers', 'fullName username profilePic badge');
    res.status(200).json(user.followers);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// @desc    Get saved posts (Saved tab)
router.get('/saved/:userId', protect, async (req, res) => {
  try {
    if (req.user.id !== req.params.userId) {
      return res.status(403).json({ message: 'Unauthorized' });
    }
    const user = await User.findById(req.params.userId).populate({
      path: 'savedPosts',
      populate: { path: 'author', select: 'fullName username profilePic' }
    });
    res.status(200).json(user.savedPosts);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
