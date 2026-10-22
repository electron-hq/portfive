const express = require('express');
const multer = require('multer');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const {
  getUserProfile, followUser, unfollowUser, getFriends, getSavedPosts,
  updateProfile, updatePictures, uploadAvatar, uploadCover,
  verifyIdentity, changePassword, toggleAds, deleteAccount
} = require('../controllers/userController');
const User = require('../models/User');

// Multer: keep file in memory, max 5MB, images only
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  }
});

// Wrapper so multer errors return clean JSON
const handleUpload = (field) => (req, res, next) => {
  upload.single(field)(req, res, (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'Image must be under 5MB' : err.message;
      return res.status(400).json({ message });
    }
    next();
  });
};

router.get('/suggested', protect, async (req, res) => {
  try {
    const users = await User.find({ _id: { $ne: req.user.id } }).select('fullName username profilePic').limit(10).lean();
    res.status(200).json(users);
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
});

router.get('/profile/:userId', protect, getUserProfile);
router.post('/follow/:targetId', protect, followUser);
router.post('/unfollow/:targetId', protect, unfollowUser);
router.get('/friends/:userId', protect, getFriends);
router.get('/saved/:userId', protect, getSavedPosts);

// Settings Routes
router.put('/update-profile', protect, updateProfile);
router.put('/update-pictures', protect, updatePictures);
router.post('/upload-avatar', protect, handleUpload('image'), uploadAvatar);
router.post('/upload-cover', protect, handleUpload('image'), uploadCover);
router.post('/verify-identity', protect, verifyIdentity);
router.put('/change-password', protect, changePassword);
router.put('/toggle-ads', protect, toggleAds);
router.delete('/delete-account', protect, deleteAccount);

module.exports = router;
