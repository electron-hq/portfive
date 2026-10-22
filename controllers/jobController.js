const JobPost = require('../models/JobPost');

// @desc    Get All Jobs (with optional search)
// @route   GET /api/jobs
const getAllJobs = async (req, res) => {
  try {
    const { search } = req.query;
    let query = { isActive: true };

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { companyName: { $regex: search, $options: 'i' } },
        { location: { $regex: search, $options: 'i' } }
      ];
    }

    const jobs = await JobPost.find(query)
      .populate('author', 'fullName username profilePic')
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json(jobs);
  } catch (error) {
    console.error('Get all jobs error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

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
    console.error('Get top jobs error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get Single Job
// @route   GET /api/jobs/:jobId
const getSingleJob = async (req, res) => {
  try {
    const job = await JobPost.findById(req.params.jobId)
      .populate('author', 'fullName username profilePic')
      .lean();

    if (!job) return res.status(404).json({ message: 'Job not found' });
    res.status(200).json(job);
  } catch (error) {
    console.error('Get single job error:', error);
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
    
    // Validate applyLink if provided
    if (applyLink && !/^https?:\/\//i.test(applyLink)) {
      return res.status(400).json({ message: 'Apply link must be a valid URL (http/https)' });
    }

    const job = await JobPost.create({
      author: req.user.id, title, companyName, location, jobType, salary, description, applyLink
    });
    res.status(201).json({ message: 'Job posted successfully', job });
  } catch (error) {
    console.error('Create job error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Delete a Job Post
// @route   DELETE /api/jobs/:jobId
const deleteJob = async (req, res) => {
  try {
    const job = await JobPost.findById(req.params.jobId);
    if (!job) return res.status(404).json({ message: 'Job not found' });
    if (job.author.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to delete this job' });
    }
    await JobPost.findByIdAndDelete(req.params.jobId);
    res.status(200).json({ message: 'Job deleted successfully' });
  } catch (error) {
    console.error('Delete job error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { getAllJobs, getTopJobs, getSingleJob, createJob, deleteJob };
