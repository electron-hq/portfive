const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const { getTopJobs, createJob } = require('../controllers/jobController');

router.get('/top', protect, getTopJobs);
router.post('/', protect, createJob);

module.exports = router;
