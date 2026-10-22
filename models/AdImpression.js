const mongoose = require('mongoose');

const AdImpressionSchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  viewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  day: { type: String, required: true } // YYYY-MM-DD
}, { timestamps: true });

// Unique index prevents duplicate impressions per user per day
AdImpressionSchema.index({ author: 1, viewer: 1, day: 1 }, { unique: true });
// TTL index automatically deletes records after 48 hours to keep DB clean
AdImpressionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 172800 });

module.exports = mongoose.model('AdImpression', AdImpressionSchema);
