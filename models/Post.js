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
  mediaType: { type: String, enum: ['image', 'video', 'none'], default: 'image' },
  caption: { type: String, default: "" },
  
  // Engagement
  reactions: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    type: { type: String, enum: ['love', 'wow', 'care', 'like'], default: 'like' }
  }],
  views: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('Post', PostSchema);
