const mongoose = require('mongoose');

const ViewLogSchema = new mongoose.Schema({
  post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['view', 'read'], required: true },
  dateString: { type: String, required: true } // Format: YYYY-MM-DD
}, { timestamps: true });

// Compound unique index: Ekjon user ekdin e ekta post e ekbar e view/read dite parbe
ViewLogSchema.index({ post: 1, user: 1, type: 1, dateString: 1 }, { unique: true });

// TTL Index: 30 din por auto delete hoye jabe jate database bhari na hoy
ViewLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 });

module.exports = mongoose.model('ViewLog', ViewLogSchema);
