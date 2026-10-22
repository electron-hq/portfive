const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },

  // Profile Info
  profilePic: { type: String, default: "" },
  coverPic: { type: String, default: "" },
  bio: { type: String, default: "" },
  website: { title: String, url: String },

  // Social Features
  followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  savedPosts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }],
  badge: { type: Boolean, default: false }, // 100 Followers auto-badge

  // Security & Recovery
  recoveryCodes: [{
    codeHash: { type: String, required: true },
    isUsed: { type: Boolean, default: false }
  }],
  tokenVersion: { type: Number, default: 0 }, // For session invalidation
  
  // Admin & Moderation
  isAdmin: { type: Boolean, default: false }, // NEW: Admin flag

  // Creator Monetization
  allowAds: { type: Boolean, default: false },
  allowAdsPens: { type: Boolean, default: true },
  allowAdsImages: { type: Boolean, default: true },
  adImpressions: { type: Number, default: 0 },
  isCreatorVerified: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
