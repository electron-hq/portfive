const express = require('express');
const router = express.Router();
const multer = require('multer');
const { protect } = require('../middlewares/authMiddleware');
const { adminProtect } = require('../middlewares/adminMiddleware');
const {
  createPost, getTopPosts, reactToPost, getUserPosts, getSinglePost,
  getComments, addComment, incrementView, incrementRead, deletePost, updatePost,
  toggleSavePost, reportPost, getReports, deleteReportedPost, dismissReport
} = require('../controllers/postController');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
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

// Admin Routes (Must be above /:postId to avoid conflicts)
router.get('/admin/reports', protect, adminProtect, getReports);
router.delete('/admin/reports/:reportId', protect, adminProtect, deleteReportedPost);
router.put('/admin/reports/:reportId/dismiss', protect, adminProtect, dismissReport);

router.post('/', protect, handleUpload('media'), createPost);
router.get('/top/:type', protect, getTopPosts);
router.get('/user/:userId', protect, getUserPosts);
router.get('/:postId', protect, getSinglePost);
router.put('/:postId', protect, updatePost);
router.delete('/:postId', protect, deletePost);
router.post('/:postId/react', protect, reactToPost);
router.post('/:postId/report', protect, reportPost);
router.post('/:postId/save', protect, toggleSavePost);
router.post('/:postId/view', protect, incrementView);
router.post('/:postId/read', protect, incrementRead);
router.get('/:postId/comments', protect, getComments);
router.post('/:postId/comments', protect, addComment);

module.exports = router;
