const mongoose = require('mongoose');

const JobApplicationSchema = new mongoose.Schema({
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'JobPost', required: true },
  applicant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  message: { type: String, required: true }
}, { timestamps: true });

// Prevent duplicate applications for the same job by the same user
JobApplicationSchema.index({ jobId: 1, applicant: 1 }, { unique: true });

module.exports = mongoose.model('JobApplication', JobApplicationSchema);
