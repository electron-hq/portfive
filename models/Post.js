const mongoose = require('mongoose');

const PostSchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  // Visual Content
  mediaUrl: { type: String, required: true },
  mediaType: { type: String, enum: ['image', 'video'], default: 'image' },
  caption: { type: String, default: "" },
  description: { type: String, default: "" },
  
  // Engagement
  reactions: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    type: { type: String, enum: ['love', 'wow', 'care', 'like'], default: 'like' }
  }],
  views: { type: Number, default: 0 },
  
  // Monetization
  isSponsored: { type: Boolean, default: false },
  sponsoredAdUrl: { type: String, default: "" } // Creator er nijer ad card link
}, { timestamps: true });

module.exports = mongoose.model('Post', PostSchema);
