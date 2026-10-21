const JobPost = require('../models/JobPost');

// @desc    Get Top 10 Jobs for Homepage
// @route   GET /api/jobs/top
const getTopJobs = async (req, res) => {
  try {
    const jobs = await JobPost.find({ isActive: true })
      .populate('author', 'fullName username profilePic')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();
    res.status(200).json(jobs);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Create a new Job Post
// @route   POST /api/jobs
const createJob = async (req, res) => {
  try {
    const { title, companyName, location, jobType, salary, description, applyLink } = req.body;
    if (!title || !companyName || !description) {
      return res.status(400).json({ message: 'Title, Company, and Description are required' });
    }
    const job = await JobPost.create({
      author: req.user.id, title, companyName, location, jobType, salary, description, applyLink
    });
    res.status(201).json({ message: 'Job posted successfully', job });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { getTopJobs, createJob };
