const express = require('express');
const router = express.Router();
const multer = require('multer');
const { protect } = require('../middlewares/authMiddleware');
const { createPost, getTopPosts, reactToPost, getUserPosts } = require('../controllers/postController');

const upload = multer({ storage: multer.memoryStorage() });

router.post('/', protect, upload.single('media'), createPost);
router.get('/top/:type', protect, getTopPosts);
router.post('/:postId/react', protect, reactToPost);
router.get('/user/:userId', protect, getUserPosts);

module.exports = router;
