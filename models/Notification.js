const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  // Types of notifications
  type: { 
    type: String, 
    enum: ['like', 'comment', 'follow', 'unfollow', 'mutual_follow', 'message', 'call', 'job_application'], 
    required: true 
  },
  
  // Contextual IDs (Optional based on type)
  postId: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'JobPost' },
  
  // Optional text for message previews or system texts
  text: { type: String, default: "" },
  
  isRead: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Notification', NotificationSchema);
