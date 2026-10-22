const JobPost = require('../models/JobPost');
const JobApplication = require('../models/JobApplication');

// @desc    Get All Jobs (with optional search)
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
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
};

// @desc    Get Single Job
const getSingleJob = async (req, res) => {
  try {
    const job = await JobPost.findById(req.params.jobId)
      .populate('author', 'fullName username profilePic')
      .lean();

    if (!job) return res.status(404).json({ message: 'Job not found' });
    res.status(200).json(job);
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
};

// @desc    Create a new Job Post
const createJob = async (req, res) => {
  try {
    const { title, companyName, location, jobType, salary, description, applyLink } = req.body;
    if (!title || !companyName || !description) {
      return res.status(400).json({ message: 'Title, Company, and Description are required' });
    }
    if (applyLink && !/^https?:\/\//i.test(applyLink)) {
      return res.status(400).json({ message: 'Apply link must be a valid URL (http/https)' });
    }

    const job = await JobPost.create({
      author: req.user.id, title, companyName, location, jobType, salary, description, applyLink
    });
    res.status(201).json({ message: 'Job posted successfully', job });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
};

// @desc    Update a Job Post
const updateJob = async (req, res) => {
  try {
    const job = await JobPost.findById(req.params.jobId);
    if (!job) return res.status(404).json({ message: 'Job not found' });
    if (job.author.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to edit this job' });
    }

    const { title, companyName, location, jobType, salary, description, applyLink } = req.body;
    if (applyLink && !/^https?:\/\//i.test(applyLink)) {
      return res.status(400).json({ message: 'Apply link must be a valid URL' });
    }

    job.title = title || job.title;
    job.companyName = companyName || job.companyName;
    job.location = location !== undefined ? location : job.location;
    job.jobType = jobType || job.jobType;
    job.salary = salary !== undefined ? salary : job.salary;
    job.description = description || job.description;
    job.applyLink = applyLink !== undefined ? applyLink : job.applyLink;

    await job.save();
    res.status(200).json({ message: 'Job updated successfully', job });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
};

// @desc    Delete a Job Post
const deleteJob = async (req, res) => {
  try {
    const job = await JobPost.findById(req.params.jobId);
    if (!job) return res.status(404).json({ message: 'Job not found' });
    if (job.author.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to delete this job' });
    }
    await JobPost.findByIdAndDelete(req.params.jobId);
    await JobApplication.deleteMany({ jobId: req.params.jobId }); // Delete related messages
    res.status(200).json({ message: 'Job deleted successfully' });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
};

// @desc    Apply/Send Message to a Job
const applyToJob = async (req, res) => {
  try {
    const { message } = req.body;
    const jobId = req.params.jobId;
    
    if (!message || !message.trim()) return res.status(400).json({ message: 'Message cannot be empty' });
    
    const job = await JobPost.findById(jobId);
    if (!job) return res.status(404).json({ message: 'Job not found' });
    if (job.author.toString() === req.user.id) return res.status(400).json({ message: 'You cannot message your own job post' });

    try {
      await JobApplication.create({ jobId, applicant: req.user.id, message: message.trim() });
      res.status(201).json({ message: 'Message sent successfully' });
    } catch (err) {
      if (err.code === 11000) return res.status(400).json({ message: 'You have already sent a message for this job' });
      throw err;
    }
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
};

// @desc    Get all received messages for my jobs
const getMyReceivedApplications = async (req, res) => {
  try {
    // Get all jobs owned by this user
    const myJobs = await JobPost.find({ author: req.user.id }).select('_id title');
    const jobIds = myJobs.map(j => j._id);

    // Get applications for these jobs
    const applications = await JobApplication.find({ jobId: { $in: jobIds } })
      .populate('applicant', 'fullName username profilePic')
      .populate('jobId', 'title companyName')
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json(applications);
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
};

// @desc    Check if already applied
const checkApplied = async (req, res) => {
  try {
    const app = await JobApplication.findOne({ jobId: req.params.jobId, applicant: req.user.id });
    res.status(200).json({ hasApplied: !!app });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
};

module.exports = { getAllJobs, getSingleJob, createJob, updateJob, deleteJob, applyToJob, getMyReceivedApplications, checkApplied };
