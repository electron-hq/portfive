const mongoose = require('mongoose');

const ReportSchema = new mongoose.Schema({
  reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  postId: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true },
  reason: { type: String, required: true },
  status: { type: String, enum: ['pending', 'resolved'], default: 'pending' }
}, { timestamps: true });

// Ensure a user can only report a specific post once
ReportSchema.index({ reporter: 1, postId: 1 }, { unique: true });

module.exports = mongoose.model('Report', ReportSchema);
