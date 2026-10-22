const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const {
  getAllJobs, getSingleJob, createJob, updateJob, deleteJob,
  applyToJob, getMyReceivedApplications, checkApplied
} = require('../controllers/jobController');

router.get('/', protect, getAllJobs);
router.get('/applications/received', protect, getMyReceivedApplications);
router.get('/:jobId/applied', protect, checkApplied);
router.get('/:jobId', protect, getSingleJob);
router.post('/', protect, createJob);
router.put('/:jobId', protect, updateJob);
router.delete('/:jobId', protect, deleteJob);
router.post('/:jobId/apply', protect, applyToJob);

module.exports = router;
