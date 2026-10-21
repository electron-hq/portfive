const mongoose = require('mongoose');

const JobPostSchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  companyName: { type: String, required: true },
  location: { type: String, default: 'Remote' },
  jobType: { type: String, enum: ['Full-time', 'Part-time', 'Contract', 'Freelance'], default: 'Full-time' },
  salary: { type: String, default: 'Negotiable' },
  description: { type: String, required: true },
  applyLink: { type: String, default: "" },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('JobPost', JobPostSchema);
