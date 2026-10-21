const express = require('express');
const router = express.Router();
const multer = require('multer');
const { protect } = require('../middlewares/authMiddleware');
const { createPost, getFeed, reactToPost } = require('../controllers/postController');

// Multer memory storage setup
const upload = multer({ storage: multer.memoryStorage() });

router.post('/', protect, upload.single('media'), createPost);
router.get('/', protect, getFeed);
router.post('/:postId/react', protect, reactToPost);

module.exports = router;
