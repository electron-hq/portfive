const User = require('../models/User');
const Post = require('../models/Post');
const Notification = require('../models/Notification');
const Message = require('../models/Message');
const Comment = require('../models/Comment');
const bcrypt = require('bcryptjs');
const { sendPushNotification } = require('./pushController');

const uploadBufferToImgBB = async (buffer, filename) => {
  const apiKey = process.env.IMGBB_API_KEY;
  const form = new FormData();
  form.append('image', buffer.toString('base64'));
  if (filename) form.append('name', filename);
  const response = await fetch('https://api.imgbb.com/1/upload?key=' + encodeURIComponent(apiKey), { method: 'POST', body: form });
  const data = await response.json();
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
    const targetUser = await User.findById(req.params.userId).select('-password');
    if (!targetUser) return res.status(404).json({ message: 'User not found' });
    const currentUser = await User.findById(req.user.id);
    const isFollowing = currentUser.following.includes(targetUser._id);
    const isMutual = targetUser.following.includes(currentUser._id);
    res.status(200).json({
      user: targetUser, followersCount: targetUser.followers.length,
      followingCount: targetUser.following.length, isFollowing, isMutual
    });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
};

const followUser = async (req, res) => {
  try {
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
        title: 'New Follower',
        body: `${currentUser.fullName} started following you.`,
        url: '/notifications.html'
      });

      if (isMutual) {
        await Notification.create({ receiver: req.user.id, sender: req.params.targetId, type: 'mutual_follow' });
      }
    }
    res.status(200).json({ message: 'Followed successfully' });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
};

const unfollowUser = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, { $pull: { following: req.params.targetId } });
    const updatedTarget = await User.findByIdAndUpdate(req.params.targetId, { $pull: { followers: req.user.id } }, { new: true });
    if (updatedTarget.followers.length < 100 && updatedTarget.badge) {
      updatedTarget.badge = false;
      await updatedTarget.save();
    }
    res.status(200).json({ message: 'Unfollowed successfully' });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
};

const getFriends = async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).populate('followers', 'fullName username profilePic badge');
    res.status(200).json(user.followers);
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
};

const getSavedPosts = async (req, res) => {
  try {
    if (req.user.id !== req.params.userId) return res.status(403).json({ message: 'Unauthorized' });
    const user = await User.findById(req.params.userId).populate({
      path: 'savedPosts', populate: { path: 'author', select: 'fullName username profilePic' }
    });
    res.status(200).json(user.savedPosts);
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
};

const updateProfile = async (req, res) => {
  try {
    const { fullName, bio, websiteTitle, websiteUrl } = req.body;
    const user = await User.findById(req.user.id);
    if (fullName) user.fullName = fullName;
    if (bio !== undefined) user.bio = bio;
    if (websiteTitle !== undefined || websiteUrl !== undefined) {
      user.website = { title: websiteTitle || '', url: websiteUrl || '' };
    }
    await user.save();
    res.status(200).json({ message: 'Profile updated successfully', user });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
};

const updatePictures = async (req, res) => {
  try {
    const { type, imageUrl } = req.body;
    const user = await User.findById(req.user.id);
    if (type === 'avatar') user.profilePic = imageUrl;
    else if (type === 'cover') user.coverPic = imageUrl;
    await user.save();
    res.status(200).json({ message: 'Picture updated', user });
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
  } catch (error) { res.status(500).json({ message: 'Upload failed' }); }
};

const uploadCover = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No image file provided' });
    const imageUrl = await uploadBufferToImgBB(req.file.buffer, 'cover-' + req.user.id);
    const user = await User.findById(req.user.id);
    user.coverPic = imageUrl;
    await user.save();
    res.status(200).json({ message: 'Cover updated', imageUrl });
  } catch (error) { res.status(500).json({ message: 'Upload failed' }); }
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
    const user = await User.findById(req.user.id);
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Verification failed. Please try again.' });
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();
    res.status(200).json({ message: 'Password updated successfully' });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
};

const toggleAds = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    user.allowAds = !user.allowAds;
    if (!user.allowAds) {
      user.allowAdsPens = false;
      user.allowAdsImages = false;
    } else {
      user.allowAdsPens = true;
      user.allowAdsImages = true;
    }
    await user.save();
    res.status(200).json({ message: 'Ads setting updated', allowAds: user.allowAds });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
};

const updateAdPreferences = async (req, res) => {
  try {
    const { allowAdsPens, allowAdsImages } = req.body;
    const user = await User.findById(req.user.id);
    if (!user.allowAds) {
      return res.status(400).json({ message: 'You must enable Ads on Profile first.' });
    }
    if (allowAdsPens !== undefined) user.allowAdsPens = allowAdsPens;
    if (allowAdsImages !== undefined) user.allowAdsImages = allowAdsImages;
    await user.save();
    res.status(200).json({ message: 'Ad preferences updated', user });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
};

// @desc    Record Ad Impression
// @route   POST /api/users/ad-impression/:authorId
const recordAdImpression = async (req, res) => {
  try {
    const authorId = req.params.authorId;
    
    // Prevent self-views from counting towards earnings
    if (authorId === req.user.id) {
      return res.status(200).json({ message: 'Self-impression ignored' });
    }

    // Increment impression count for the author
    await User.findByIdAndUpdate(authorId, { $inc: { adImpressions: 1 } });
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Record Ad Impression error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const deleteAccount = async (req, res) => {
  try {
    const userId = req.user.id;
    await Post.deleteMany({ author: userId });
    await Comment.deleteMany({ author: userId });
    await Message.deleteMany({ $or: [{ sender: userId }, { receiver: userId }] });
    await Notification.deleteMany({ $or: [{ receiver: userId }, { sender: userId }] });
    await User.findByIdAndDelete(userId);
    res.cookie('portfive_token', '', { maxAge: 1 });
    res.status(200).json({ message: 'Account permanently deleted' });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
};

module.exports = {
  getSuggestedUsers, getUserProfile, followUser, unfollowUser, getFriends, getSavedPosts,
  updateProfile, updatePictures, uploadAvatar, uploadCover,
  verifyIdentity, changePassword, toggleAds, updateAdPreferences, recordAdImpression, deleteAccount
};
