const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const { getUserProfile, followUser, unfollowUser, getFriends, getSavedPosts } = require('../controllers/userController');
const User = require('../models/User');

// Suggested Users (For Homepage)
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

router.get('/profile/:userId', protect, getUserProfile);
router.post('/follow/:targetId', protect, followUser);
router.post('/unfollow/:targetId', protect, unfollowUser);
router.get('/friends/:userId', protect, getFriends);
router.get('/saved/:userId', protect, getSavedPosts);

module.exports = router;
