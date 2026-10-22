const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const { getAllJobs, getTopJobs, getSingleJob, createJob, deleteJob } = require('../controllers/jobController');

router.get('/', protect, getAllJobs);
router.get('/top', protect, getTopJobs);
router.get('/:jobId', protect, getSingleJob);
router.post('/', protect, createJob);
router.delete('/:jobId', protect, deleteJob);

module.exports = router;
