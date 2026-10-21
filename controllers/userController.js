const User = require('../models/User');
const Notification = require('../models/Notification');

// @desc    Get User Profile Info
// @route   GET /api/users/profile/:userId
const getUserProfile = async (req, res) => {
  try {
    const targetUser = await User.findById(req.params.userId).select('-password');
    if (!targetUser) return res.status(404).json({ message: 'User not found' });

    const currentUser = await User.findById(req.user.id);
    
    // Check if current user follows target user
    const isFollowing = currentUser.following.includes(targetUser._id);
    // Check if target user follows current user (Mutual)
    const isMutual = targetUser.following.includes(currentUser._id);

    res.status(200).json({
      user: targetUser,
      followersCount: targetUser.followers.length,
      followingCount: targetUser.following.length,
      isFollowing,
      isMutual
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Follow a user
// @route   POST /api/users/follow/:targetId
const followUser = async (req, res) => {
  try {
    if (req.user.id === req.params.targetId) {
      return res.status(400).json({ message: 'You cannot follow yourself' });
    }

    const targetUser = await User.findById(req.params.targetId);
    const currentUser = await User.findById(req.user.id);

    if (!targetUser || !currentUser) return res.status(404).json({ message: 'User not found' });

    if (!currentUser.following.includes(req.params.targetId)) {
      await User.findByIdAndUpdate(req.user.id, { $push: { following: req.params.targetId } });
      const updatedTarget = await User.findByIdAndUpdate(req.params.targetId, { $push: { followers: req.user.id } }, { new: true });

      // 100 Followers Auto-Badge Logic
      if (updatedTarget.followers.length >= 100 && !updatedTarget.badge) {
        updatedTarget.badge = true;
        await updatedTarget.save();
      }

      // Notification
      await Notification.create({
        receiver: req.params.targetId,
        sender: req.user.id,
        type: 'follow'
      });
    }
    res.status(200).json({ message: 'Followed successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Unfollow a user
// @route   POST /api/users/unfollow/:targetId
const unfollowUser = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, { $pull: { following: req.params.targetId } });
    const updatedTarget = await User.findByIdAndUpdate(req.params.targetId, { $pull: { followers: req.user.id } }, { new: true });

    // Remove badge if followers drop below 100
    if (updatedTarget.followers.length < 100 && updatedTarget.badge) {
      updatedTarget.badge = false;
      await updatedTarget.save();
    }

    res.status(200).json({ message: 'Unfollowed successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get friends list (followers)
// @route   GET /api/users/friends/:userId
const getFriends = async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).populate('followers', 'fullName username profilePic badge');
    res.status(200).json(user.followers);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get saved posts
// @route   GET /api/users/saved/:userId
const getSavedPosts = async (req, res) => {
  try {
    if (req.user.id !== req.params.userId) {
      return res.status(403).json({ message: 'Unauthorized' });
    }
    const user = await User.findById(req.params.userId).populate({
      path: 'savedPosts',
      populate: { path: 'author', select: 'fullName username profilePic' }
    });
    res.status(200).json(user.savedPosts);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { getUserProfile, followUser, unfollowUser, getFriends, getSavedPosts };
