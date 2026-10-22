const express = require('express');
const router = express.Router();
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const { protect } = require('../middlewares/authMiddleware');
const {
  getSuggestedUsers, getUserProfile, followUser, unfollowUser, getFriends, getSavedPosts,
  updateProfile, uploadAvatar, uploadCover,
  verifyIdentity, changePassword, toggleAds, updateAdPreferences, recordAdImpression, deleteAccount
} = require('../controllers/userController');

// Rate Limiter for sensitive actions
const actionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per window
  message: { message: 'Too many attempts, please try again later.' }
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    // Block SVG to prevent XSS
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowedMimeTypes.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPG, PNG, WEBP, and GIF images are allowed'));
  }
});

const handleUpload = (field) => (req, res, next) => {
  upload.single(field)(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message });
    next();
  });
};

router.get('/suggested', protect, getSuggestedUsers);
router.get('/profile/:userId', protect, getUserProfile);
router.post('/follow/:targetId', protect, followUser);
router.post('/unfollow/:targetId', protect, unfollowUser);
router.get('/friends/:userId', protect, getFriends);
router.get('/saved/:userId', protect, getSavedPosts);
router.put('/update-profile', protect, updateProfile);

router.post('/upload-avatar', protect, handleUpload('image'), uploadAvatar);
router.post('/upload-cover', protect, handleUpload('image'), uploadCover);

// Apply rate limiter to identity and password changes
router.post('/verify-identity', protect, actionLimiter, verifyIdentity);
router.put('/change-password', protect, actionLimiter, changePassword);

router.put('/toggle-ads', protect, toggleAds);
router.put('/update-ad-preferences', protect, updateAdPreferences);
router.post('/ad-impression/:authorId', protect, recordAdImpression);
router.delete('/delete-account', protect, actionLimiter, deleteAccount);

module.exports = router;
