const express = require('express');
const router = express.Router();
const multer = require('multer');
const { protect } = require('../middlewares/authMiddleware');
const { 
  getSuggestedUsers, getUserProfile, followUser, unfollowUser, getFriends, getSavedPosts,
  updateProfile, updatePictures, uploadAvatar, uploadCover,
  verifyIdentity, changePassword, toggleAds, updateAdPreferences, recordAdImpression, deleteAccount
} = require('../controllers/userController');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
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
router.put('/update-pictures', protect, updatePictures);
router.post('/upload-avatar', protect, handleUpload('image'), uploadAvatar);
router.post('/upload-cover', protect, handleUpload('image'), uploadCover);
router.post('/verify-identity', protect, verifyIdentity);
router.put('/change-password', protect, changePassword);

router.put('/toggle-ads', protect, toggleAds);
router.put('/update-ad-preferences', protect, updateAdPreferences);
router.post('/ad-impression/:authorId', protect, recordAdImpression); // New Route
router.delete('/delete-account', protect, deleteAccount);

module.exports = router;
