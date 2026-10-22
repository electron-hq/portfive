const express = require('express');
const router = express.Router();
const multer = require('multer');
const { protect } = require('../middlewares/authMiddleware');
const { 
  createPost, getTopPosts, reactToPost, getUserPosts, getSinglePost, getComments, addComment, incrementView, deletePost, updatePost, toggleSavePost
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
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'Image must be under 10MB' : err.message;
      return res.status(400).json({ message });
    }
    next();
  });
};

router.post('/', protect, handleUpload('media'), createPost);
router.get('/top/:type', protect, getTopPosts);
router.get('/user/:userId', protect, getUserPosts);
router.get('/:postId', protect, getSinglePost);
router.put('/:postId', protect, updatePost);
router.delete('/:postId', protect, deletePost);
router.post('/:postId/react', protect, reactToPost);
router.post('/:postId/save', protect, toggleSavePost);
router.post('/:postId/view', protect, incrementView);
router.get('/:postId/comments', protect, getComments);
router.post('/:postId/comments', protect, addComment);

module.exports = router;
