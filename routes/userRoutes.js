const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const User = require('../models/User');

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
    // Note: Only the user themselves should see their saved posts
    if (req.user.id !== req.params.userId) {
      return res.status(403).json({ message: 'Unauthorized to view saved posts' });
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
