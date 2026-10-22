const mongoose = require('mongoose');

const PostSchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // Post Type: 'image', 'video', or 'pen' (Article)
  postType: { type: String, enum: ['image', 'video', 'pen'], default: 'image' },

  // For Pens (Articles)
  title: { type: String, default: "" },
  content: { type: String, default: "" }, // Up to 8000 chars

  // Visual Content (Optional for Pens, required for Images/Videos)
  mediaUrl: { type: String, default: "" },
  thumbnailUrl: { type: String, default: "" }, // Video thumbnail (YouTube)
  mediaType: { type: String, enum: ['image', 'video', 'none', 'ad'], default: 'image' },
  caption: { type: String, default: "" },

  // Ad Control per post
  showAds: { type: Boolean, default: true }, // NEW: Ads on/off for specific post

  // Engagement
  reactions: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    type: { type: String, enum: ['love', 'wow', 'care', 'like'], default: 'like' }
  }],
  views: { type: Number, default: 0 },
  readsCount: { type: Number, default: 0 } // For Pens 5s read tracking
}, { timestamps: true });

module.exports = mongoose.model('Post', PostSchema);
