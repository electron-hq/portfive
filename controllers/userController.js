const User = require('../models/User');
const Post = require('../models/Post');
const Notification = require('../models/Notification');
const Message = require('../models/Message');
const Comment = require('../models/Comment');
const bcrypt = require('bcryptjs');

// Helper: upload an image buffer to ImgBB and return its URL
const uploadBufferToImgBB = async (buffer, filename) => {
  const apiKey = process.env.IMGBB_API_KEY;
  if (!apiKey) throw new Error('IMGBB_API_KEY is not set in .env');

  const form = new FormData();
  form.append('image', buffer.toString('base64'));
  if (filename) form.append('name', filename);

  const response = await fetch('https://api.imgbb.com/1/upload?key=' + encodeURIComponent(apiKey), {
    method: 'POST',
    body: form
  });
  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error((data.error && data.error.message) || 'ImgBB upload failed');
  }
  return data.data.url;
};

// @desc    Get User Profile Info
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

// @desc    Follow a user
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
      await Notification.create({ receiver: req.params.targetId, sender: req.user.id, type: 'follow' });
    }
    res.status(200).json({ message: 'Followed successfully' });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
};

// @desc    Unfollow a user
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

// @desc    Get friends list
const getFriends = async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).populate('followers', 'fullName username profilePic badge');
    res.status(200).json(user.followers);
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
};

// @desc    Get saved posts
const getSavedPosts = async (req, res) => {
  try {
    if (req.user.id !== req.params.userId) return res.status(403).json({ message: 'Unauthorized' });
    const user = await User.findById(req.params.userId).populate({
      path: 'savedPosts', populate: { path: 'author', select: 'fullName username profilePic' }
    });
    res.status(200).json(user.savedPosts);
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
};

// @desc    Update Profile
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

// @desc    Update Avatar/Cover (via URL)
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

// @desc    Upload Avatar (file upload to ImgBB)
const uploadAvatar = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No image file provided' });
    const imageUrl = await uploadBufferToImgBB(req.file.buffer, 'avatar-' + req.user.id);
    const user = await User.findById(req.user.id);
    user.profilePic = imageUrl;
    await user.save();
    res.status(200).json({ message: 'Avatar updated', imageUrl });
  } catch (error) {
    console.error('Avatar upload error:', error.message);
    res.status(500).json({ message: 'Upload failed' });
  }
};

// @desc    Upload Cover (file upload to ImgBB)
const uploadCover = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No image file provided' });
    const imageUrl = await uploadBufferToImgBB(req.file.buffer, 'cover-' + req.user.id);
    const user = await User.findById(req.user.id);
    user.coverPic = imageUrl;
    await user.save();
    res.status(200).json({ message: 'Cover updated', imageUrl });
  } catch (error) {
    console.error('Cover upload error:', error.message);
    res.status(500).json({ message: 'Upload failed' });
  }
};

// @desc    Verify Old Password (Step 1)
const verifyIdentity = async (req, res) => {
  try {
    const { oldPassword } = req.body;
    const user = await User.findById(req.user.id);
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Incorrect old password' });
    res.status(200).json({ success: true, message: 'Identity verified' });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
};

// @desc    Change Password (Step 2)
const changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id);

    // Double check old password for security
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Verification failed. Please try again.' });

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();
    res.status(200).json({ message: 'Password updated successfully' });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
};

// @desc    Toggle Ads
const toggleAds = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    user.allowAds = !user.allowAds;
    await user.save();
    res.status(200).json({ message: 'Ads setting updated', allowAds: user.allowAds });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
};

// @desc    Delete Account
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
  getUserProfile, followUser, unfollowUser, getFriends, getSavedPosts,
  updateProfile, updatePictures, uploadAvatar, uploadCover,
  verifyIdentity, changePassword, toggleAds, deleteAccount
};
