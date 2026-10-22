const Post = require('../models/Post');
const Comment = require('../models/Comment');
const User = require('../models/User');
const Notification = require('../models/Notification');
const Report = require('../models/Report');
const { sendPushNotification } = require('./pushController');

const MAX_PEN_CONTENT = 8000;
const MAX_PEN_TITLE = 150;
const MAX_CAPTION = 500;

const uploadBufferToImgBB = async (buffer, filename) => {
  const apiKey = process.env.IMGBB_API_KEY;
  const form = new FormData();
  form.append('image', buffer.toString('base64'));
  if (filename) form.append('name', filename);
  const response = await fetch('https://api.imgbb.com/1/upload?key=' + encodeURIComponent(apiKey), { method: 'POST', body: form });
  const data = await response.json();
  return data.data.url;
};

const getYouTubeID = (rawUrl) => {
  try {
    const u = new URL(String(rawUrl || '').trim());
    const host = u.hostname.replace(/^www\./, '').replace(/^m\./, '');
    let id = null;
    if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
    else if (host === 'youtube.com' || host === 'music.youtube.com') {
      if (u.pathname === '/watch') id = u.searchParams.get('v');
      else { const m = u.pathname.match(/^\/(embed|shorts|v|live)\/([^/?#]+)/); if (m) id = m[2]; }
    }
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch (e) { return null; }
};

const createPost = async (req, res) => {
  try {
    const postType = req.body.postType;
    const caption = String(req.body.caption || '').trim().slice(0, MAX_CAPTION);
    let title = '', content = '', mediaUrl = '', thumbnailUrl = '', mediaType = 'image';

    if (postType === 'image') {
      mediaUrl = await uploadBufferToImgBB(req.file.buffer, 'post-' + req.user.id + '-' + Date.now());
    } else if (postType === 'video') {
      const ytId = getYouTubeID(req.body.videoUrl);
      mediaUrl = 'https://www.youtube.com/watch?v=' + ytId;
      mediaType = 'video';
      thumbnailUrl = req.file ? await uploadBufferToImgBB(req.file.buffer, 'thumb-' + req.user.id) : 'https://img.youtube.com/vi/' + ytId + '/hqdefault.jpg';
    } else if (postType === 'pen') {
      title = String(req.body.title || '').trim();
      content = String(req.body.content || '').trim();
      if (req.file) mediaUrl = await uploadBufferToImgBB(req.file.buffer, 'pen-' + req.user.id);
      else mediaType = 'none';
    }

    const newPost = await Post.create({ author: req.user.id, postType, title, content, mediaUrl, thumbnailUrl, mediaType, caption });
    res.status(201).json({ message: 'Post created!', post: newPost });
  } catch (error) { res.status(500).json({ message: 'Failed to create post.' }); }
};

const getTopPosts = async (req, res) => {
  try {
    const { type } = req.params;
    let query = { postType: type };
    const limit = type === 'image' ? 50 : 10;
    const posts = await Post.find(query).populate('author', 'fullName username profilePic allowAds adImpressions').sort({ createdAt: -1 }).limit(limit).lean();
    const user = await User.findById(req.user.id).select('savedPosts');
    const savedIds = user.savedPosts ? user.savedPosts.map(id => id.toString()) : [];
    res.status(200).json(posts.map(post => ({
      ...post, likesCount: post.reactions ? post.reactions.length : 0,
      hasLiked: post.reactions?.some(r => r.user.toString() === req.user.id),
      isSaved: savedIds.includes(post._id.toString())
    })));
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
};

const reactToPost = async (req, res) => {
  try {
    const { type } = req.body;
    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).json({ message: 'Post not found' });

    const existing = post.reactions.findIndex(r => r.user.toString() === req.user.id);
    if (existing > -1) {
      if (post.reactions[existing].type === type) post.reactions.splice(existing, 1);
      else post.reactions[existing].type = type;
    } else {
      post.reactions.push({ user: req.user.id, type: type || 'love' });
      if (post.author.toString() !== req.user.id) {
        const currentUser = await User.findById(req.user.id);
        await Notification.create({ receiver: post.author, sender: req.user.id, type: 'like', postId: post._id });
        sendPushNotification(post.author, { title: 'New Love', body: `${currentUser.fullName} loved your post.`, url: `/post.html?id=${post._id}` });
      }
    }
    await post.save();
    res.status(200).json({ message: 'Reaction updated', reactions: post.reactions });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
};

const getUserPosts = async (req, res) => {
  try {
    const posts = await Post.find({ author: req.params.userId }).populate('author', 'fullName username profilePic').sort({ createdAt: -1 }).lean();
    res.status(200).json(posts);
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
};

const getSinglePost = async (req, res) => {
  try {
    // Added allowAds to populate
    const post = await Post.findById(req.params.postId).populate('author', 'fullName username profilePic allowAds').lean();
    if (!post) return res.status(404).json({ message: 'Post not found' });
    const commentsCount = await Comment.countDocuments({ postId: post._id });
    const user = await User.findById(req.user.id).select('savedPosts');
    const isSaved = user.savedPosts ? user.savedPosts.some(id => id.toString() === post._id.toString()) : false;
    res.status(200).json({
      ...post, likesCount: post.reactions ? post.reactions.length : 0,
      hasLiked: post.reactions?.some(r => r.user.toString() === req.user.id),
      isSaved, commentsCount
    });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
};

const getComments = async (req, res) => {
  try {
    const comments = await Comment.find({ postId: req.params.postId }).populate('author', 'fullName username profilePic').sort({ createdAt: -1 }).lean();
    res.status(200).json(comments);
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
};

const addComment = async (req, res) => {
  try {
    const { content } = req.body;
    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).json({ message: 'Post not found' });

    const comment = await Comment.create({ postId: req.params.postId, author: req.user.id, content: content.trim() });
    
    if (post.author.toString() !== req.user.id) {
      const currentUser = await User.findById(req.user.id);
      await Notification.create({ receiver: post.author, sender: req.user.id, type: 'comment', postId: post._id });
      sendPushNotification(post.author, {
        title: 'New Comment',
        body: `${currentUser.fullName} commented: "${content.substring(0, 30)}..."`,
        url: `/post.html?id=${post._id}`
      });
    }
    const populatedComment = await comment.populate('author', 'fullName username profilePic');
    res.status(201).json(populatedComment);
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
};

const incrementView = async (req, res) => {
  try {
    await Post.findByIdAndUpdate(req.params.postId, { $inc: { views: 1 } });
    res.status(200).json({ success: true });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
};

const deletePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);
    if (post.author.toString() !== req.user.id) return res.status(403).json({ message: 'Not authorized' });
    await Post.findByIdAndDelete(req.params.postId);
    await Comment.deleteMany({ postId: req.params.postId });
    res.status(200).json({ message: 'Post deleted' });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
};

const updatePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);
    if (post.author.toString() !== req.user.id) return res.status(403).json({ message: 'Not authorized' });
    if (req.body.caption !== undefined) post.caption = String(req.body.caption).trim().slice(0, MAX_CAPTION);
    if (req.body.title !== undefined) post.title = String(req.body.title).trim();
    if (req.body.content !== undefined) post.content = String(req.body.content).trim();
    await post.save();
    res.status(200).json({ message: 'Post updated', post });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
};

const toggleSavePost = async (req, res) => {
  try {
    const postId = req.params.postId;
    const user = await User.findById(req.user.id);
    const isSaved = user.savedPosts.includes(postId);
    if (isSaved) user.savedPosts = user.savedPosts.filter(id => id.toString() !== postId.toString());
    else user.savedPosts.push(postId);
    await user.save();
    res.status(200).json({ message: 'Saved state updated', isSaved: !isSaved });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
};

const reportPost = async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason || !reason.trim()) return res.status(400).json({ message: 'Reason is required' });

    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).json({ message: 'Post not found' });

    if (post.author.toString() === req.user.id) {
      return res.status(400).json({ message: 'You cannot report your own post' });
    }

    const existingReport = await Report.findOne({ reporter: req.user.id, postId: post._id });
    if (existingReport) return res.status(400).json({ message: 'You have already reported this post' });

    await Report.create({ reporter: req.user.id, postId: post._id, reason: reason.trim() });
    res.status(201).json({ message: 'Post reported successfully. Moderators will review it.' });
  } catch (error) { res.status(500).json({ message: 'Server error' }); }
};

module.exports = {
  createPost, getTopPosts, reactToPost, getUserPosts, getSinglePost, 
  getComments, addComment, incrementView, deletePost, updatePost, 
  toggleSavePost, reportPost
};
