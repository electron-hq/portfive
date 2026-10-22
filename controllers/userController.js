const mongoose = require('mongoose');
const User = require('../models/User');
const Post = require('../models/Post');
const Notification = require('../models/Notification');
const Message = require('../models/Message');
const Comment = require('../models/Comment');
const AdImpression = require('../models/AdImpression');
const bcrypt = require('bcryptjs');
const { sendPushNotification } = require('./pushController');
const { setAuthCookie, clearAuthCookie } = require('../utils/token');

const uploadBufferToImgBB = async (buffer, filename) => {
  const apiKey = process.env.IMGBB_API_KEY;
  const form = new FormData();
  form.append('image', buffer.toString('base64'));
  if (filename) form.append('name', filename);
  const response = await fetch('https://api.imgbb.com/1/upload?key=' + encodeURIComponent(apiKey), { method: 'POST', body: form });
  const data = await response.json();
  if (!data.success) throw new Error('ImgBB upload failed');
  return data.data.url;
};

const getSuggestedUsers = async (req, res) => {
  try {
    const currentUser = await User.findById(req.user.id);
    const users = await User.find({
      _id: { $nin: [...currentUser.following, req.user.id] }
    }).select('fullName username profilePic badge').limit(10);
    res.status(200).json(users);
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
};

const getUserProfile = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.userId)) return res.status(400).json({ message: 'Invalid User ID' });
    const targetUser = await User.findById(req.params.userId).select('fullName username profilePic coverPic bio website followers following badge');
    if (!targetUser) return res.status(404).json({ message: 'User not found' });
    
    const currentUser = await User.findById(req.user.id);
    const isFollowing = currentUser.following.includes(targetUser._id);
    const isMutual = targetUser.following.includes(currentUser._id) && isFollowing;
    
    res.status(200).json({
      user: {
        _id: targetUser._id, fullName: targetUser.fullName, username: targetUser.username,
        profilePic: targetUser.profilePic, coverPic: targetUser.coverPic,
        bio: targetUser.bio, website: targetUser.website, badge: targetUser.badge
      }, 
      followersCount: targetUser.followers.length,
      followingCount: targetUser.following.length, 
      isFollowing, isMutual
    });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
};

const followUser = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.targetId)) return res.status(400).json({ message: 'Invalid ID' });
    if (req.user.id === req.params.targetId) return res.status(400).json({ message: 'You cannot follow yourself' });
    const targetUser = await User.findById(req.params.targetId);
    const currentUser = await User.findById(req.user.id);
    if (!targetUser || !currentUser) return res.status(404).json({ message: 'User not found' });

    if (!currentUser.following.includes(req.params.targetId)) {
      await User.findByIdAndUpdate(req.user.id, { $push: { following: req.params.targetId } });
      const updatedTarget = await User.findByIdAndUpdate(req.params.targetId, { $push: { followers: req.user.id } }, { new: true });

      if (updatedTarget.followers.length >= 100 && !updatedTarget.badge) {
        updatedTarget.badge = true;
        await updatedTarget.save();
      }

      const isMutual = updatedTarget.following.includes(req.user.id);
      await Notification.create({ receiver: req.params.targetId, sender: req.user.id, type: isMutual ? 'mutual_follow' : 'follow' });

      sendPushNotification(req.params.targetId, {
        title: 'New Follower', body: `${currentUser.fullName} started following you.`, url: '/notifications.html'
      });

      if (isMutual) await Notification.create({ receiver: req.user.id, sender: req.params.targetId, type: 'mutual_follow' });
    }
    res.status(200).json({ message: 'Followed successfully' });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
};

const unfollowUser = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.targetId)) return res.status(400).json({ message: 'Invalid ID' });
    
    const currentUser = await User.findById(req.user.id);
    const targetUser = await User.findById(req.params.targetId);
    if (!currentUser || !targetUser) return res.status(404).json({ message: 'User not found' });

    // Check if they were mutual before unfollowing
    const wasMutual = currentUser.following.includes(req.params.targetId) && targetUser.following.includes(req.user.id);

    await User.findByIdAndUpdate(req.user.id, { $pull: { following: req.params.targetId } });
    const updatedTarget = await User.findByIdAndUpdate(req.params.targetId, { $pull: { followers: req.user.id } }, { new: true });
    
    if (updatedTarget && updatedTarget.followers.length < 100 && updatedTarget.badge) {
      updatedTarget.badge = false;
      await updatedTarget.save();
    }

    // If they were mutual, delete all chats between them
    if (wasMutual) {
      await Message.deleteMany({
        $or: [
          { sender: req.user.id, receiver: req.params.targetId },
          { sender: req.params.targetId, receiver: req.user.id }
        ]
      });
    }

    res.status(200).json({ message: 'Unfollowed successfully' });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
};

const getFriends = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.userId)) return res.status(400).json({ message: 'Invalid ID' });
    const user = await User.findById(req.params.userId).populate('followers', 'fullName username profilePic badge');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.status(200).json(user.followers);
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
};

const getSavedPosts = async (req, res) => {
  try {
    if (req.user.id !== req.params.userId) return res.status(403).json({ message: 'Unauthorized' });
    const user = await User.findById(req.params.userId).populate({
      path: 'savedPosts', populate: { path: 'author', select: 'fullName username profilePic' }
    });
    const validPosts = user.savedPosts.filter(p => p && p.author);
    res.status(200).json(validPosts);
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
};

const updateProfile = async (req, res) => {
  try {
    const { fullName, bio, websiteTitle, websiteUrl } = req.body;
    const user = await User.findById(req.user.id);
    
    if (fullName !== undefined) {
      if (typeof fullName !== 'string') return res.status(400).json({ message: 'Invalid input' });
      const trimmed = fullName.trim();
      if (!trimmed) return res.status(400).json({ message: 'Name cannot be empty' });
      if (trimmed.length > 50) return res.status(400).json({ message: 'Name too long' });
      user.fullName = trimmed;
    }
    
    if (bio !== undefined) {
      if (typeof bio !== 'string') return res.status(400).json({ message: 'Invalid input' });
      if (bio.length > 100) return res.status(400).json({ message: 'Bio too long' });
      user.bio = bio.trim();
    }

    if (websiteTitle !== undefined && typeof websiteTitle !== 'string') return res.status(400).json({ message: 'Invalid input' });
    if (websiteTitle && websiteTitle.length > 30) return res.status(400).json({ message: 'Website title too long' });
    
    if (websiteUrl && websiteUrl.trim() !== '') {
      if (typeof websiteUrl !== 'string' || !/^https?:\/\//i.test(websiteUrl)) {
        return res.status(400).json({ message: 'Website URL must start with http:// or https://' });
      }
      if (websiteUrl.length > 100) return res.status(400).json({ message: 'Website URL too long' });
    }

    if (websiteTitle !== undefined || websiteUrl !== undefined) {
      user.website = { title: (websiteTitle || '').trim(), url: (websiteUrl || '').trim() };
    }
    
    await user.save();
    const { password, ...safeUser } = user.toObject();
    res.status(200).json({ message: 'Profile updated successfully', user: safeUser });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
};

const uploadAvatar = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No image file provided' });
    const imageUrl = await uploadBufferToImgBB(req.file.buffer, 'avatar-' + req.user.id);
    const user = await User.findById(req.user.id);
    user.profilePic = imageUrl;
    await user.save();
    res.status(200).json({ message: 'Avatar updated', imageUrl });
  } catch (error) { res.status(500).json({ message: error.message || 'Upload failed' }); }
};

const uploadCover = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No image file provided' });
    const imageUrl = await uploadBufferToImgBB(req.file.buffer, 'cover-' + req.user.id);
    const user = await User.findById(req.user.id);
    user.coverPic = imageUrl;
    await user.save();
    res.status(200).json({ message: 'Cover updated', imageUrl });
  } catch (error) { res.status(500).json({ message: error.message || 'Upload failed' }); }
};

const verifyIdentity = async (req, res) => {
  try {
    const { oldPassword } = req.body;
    const user = await User.findById(req.user.id);
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Incorrect old password' });
    res.status(200).json({ success: true, message: 'Identity verified' });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
};

const changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 8 || newPassword.length > 72) {
      return res.status(400).json({ message: 'Password must be 8-72 characters long' });
    }
    
    const user = await User.findById(req.user.id);
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Verification failed. Please try again.' });
    
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    user.tokenVersion = (user.tokenVersion || 0) + 1; 
    await user.save();

    setAuthCookie(res, user);
    res.status(200).json({ message: 'Password updated successfully' });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
};

const toggleAds = async (req, res) => {
  res.status(200).json({ message: 'Ads are always enabled.' });
};

const updateAdPreferences = async (req, res) => {
  res.status(200).json({ message: 'Ads are always enabled.' });
};

const recordAdImpression = async (req, res) => {
  try {
    const authorId = req.params.authorId;
    const userId = req.user.id;

    if (!mongoose.isValidObjectId(authorId)) return res.status(400).json({ message: 'Invalid ID' });
    if (authorId === userId) return res.status(200).json({ message: 'Self-impression ignored' });

    const today = new Date().toISOString().slice(0, 10);
    
    try {
      await AdImpression.create({ author: authorId, viewer: userId, day: today });
      await User.findByIdAndUpdate(authorId, { $inc: { adImpressions: 1 } });
    } catch (err) {
      if (err.code !== 11000) throw err; 
    }
    
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Record Ad Impression error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const deleteAccount = async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ message: 'Password required for deletion' });

    const userId = req.user.id;
    const user = await User.findById(userId);
    
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Incorrect password' });

    const userPosts = await Post.find({ author: userId }).select('_id');
    const postIds = userPosts.map(p => p._id);

    await Post.deleteMany({ author: userId });
    await Comment.deleteMany({ $or: [{ author: userId }, { postId: { $in: postIds } }] });
    await Message.deleteMany({ $or: [{ sender: userId }, { receiver: userId }] });
    await Notification.deleteMany({ $or: [{ receiver: userId }, { sender: userId }] });
    await AdImpression.deleteMany({ $or: [{ author: userId }, { viewer: userId }] });
    
    try {
      const Report = mongoose.model('Report');
      await Report.deleteMany({ $or: [{ reporter: userId }, { postId: { $in: postIds } }] });
    } catch(e) { }
    try {
      const Subscription = mongoose.model('Subscription');
      await Subscription.deleteMany({ $or: [{ subscriber: userId }, { subscribedTo: userId }] });
    } catch(e) { }

    await User.updateMany({ followers: userId }, { $pull: { followers: userId } });
    await User.updateMany({ following: userId }, { $pull: { following: userId } });

    await Post.updateMany({ 'reactions.user': userId }, { $pull: { reactions: { user: userId } } });
    await User.updateMany({ savedPosts: { $in: postIds } }, { $pull: { savedPosts: { $in: postIds } } });

    await User.findByIdAndDelete(userId);

    clearAuthCookie(res);
    res.status(200).json({ message: 'Account permanently deleted' });
  } catch (error) { 
    console.error('Delete account error:', error);
    res.status(500).json({ message: 'Server error' }); 
  }
};

module.exports = {
  getSuggestedUsers, getUserProfile, followUser, unfollowUser, getFriends, getSavedPosts,
  updateProfile, uploadAvatar, uploadCover,
  verifyIdentity, changePassword, toggleAds, updateAdPreferences, recordAdImpression, deleteAccount
};
