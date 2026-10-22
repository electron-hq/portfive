const Post = require('../models/Post');

const MAX_PEN_CONTENT = 8000;
const MAX_PEN_TITLE = 150;
const MAX_CAPTION = 500;

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

// Helper: extract an 11-character YouTube video ID from a link (or null)
const getYouTubeID = (rawUrl) => {
  try {
    const u = new URL(String(rawUrl || '').trim());
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    const host = u.hostname.replace(/^www\./, '').replace(/^m\./, '');
    let id = null;
    if (host === 'youtu.be') {
      id = u.pathname.slice(1).split('/')[0];
    } else if (host === 'youtube.com' || host === 'music.youtube.com') {
      if (u.pathname === '/watch') id = u.searchParams.get('v');
      else {
        const m = u.pathname.match(/^\/(embed|shorts|v|live)\/([^/?#]+)/);
        if (m) id = m[2];
      }
    }
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch (e) {
    return null;
  }
};

// @desc    Create a new Post
// @route   POST /api/posts
const createPost = async (req, res) => {
  try {
    const postType = req.body.postType;
    if (!['image', 'video', 'pen'].includes(postType)) {
      return res.status(400).json({ message: 'Invalid post type' });
    }

    const caption = String(req.body.caption || '').trim().slice(0, MAX_CAPTION);

    let title = '';
    let content = '';
    let mediaUrl = '';
    let thumbnailUrl = '';
    let mediaType = 'image';

    if (postType === 'image') {
      if (!req.file) return res.status(400).json({ message: 'Image file is required' });
      mediaUrl = await uploadBufferToImgBB(req.file.buffer, 'post-' + req.user.id + '-' + Date.now());
      mediaType = 'image';
    }
    else if (postType === 'video') {
      const ytId = getYouTubeID(req.body.videoUrl);
      if (!ytId) return res.status(400).json({ message: 'Please paste a valid YouTube link' });
      mediaUrl = 'https://www.youtube.com/watch?v=' + ytId;
      mediaType = 'video';

      // Optional custom thumbnail; falls back to the YouTube thumbnail
      if (req.file) {
        thumbnailUrl = await uploadBufferToImgBB(req.file.buffer, 'thumb-' + req.user.id + '-' + Date.now());
      } else {
        thumbnailUrl = 'https://img.youtube.com/vi/' + ytId + '/hqdefault.jpg';
      }
    }
    else if (postType === 'pen') {
      title = String(req.body.title || '').trim();
      content = String(req.body.content || '').trim();
      if (!title || !content) {
        return res.status(400).json({ message: 'Title and content are required for a Pen' });
      }
      if (title.length > MAX_PEN_TITLE) {
        return res.status(400).json({ message: 'Title must be ' + MAX_PEN_TITLE + ' characters or less' });
      }
      if (content.length > MAX_PEN_CONTENT) {
        return res.status(400).json({ message: 'Content must be ' + MAX_PEN_CONTENT + ' characters or less' });
      }
      if (req.file) {
        mediaUrl = await uploadBufferToImgBB(req.file.buffer, 'pen-' + req.user.id + '-' + Date.now());
        mediaType = 'image';
      } else {
        mediaType = 'none';
      }
    }

    const newPost = await Post.create({
      author: req.user.id,
      postType,
      title,
      content,
      mediaUrl,
      thumbnailUrl,
      mediaType,
      caption
    });

    res.status(201).json({ message: 'Post created!', post: newPost });
  } catch (error) {
    console.error('Create post error:', error.message);
    res.status(500).json({ message: 'Failed to create post. Please try again.' });
  }
};

// @desc    Get Top Posts
// @route   GET /api/posts/top/:type
const getTopPosts = async (req, res) => {
  try {
    const { type } = req.params;

    let query = {};
    if (type === 'image') query = { postType: 'image' };
    else if (type === 'video') query = { postType: 'video' };
    else if (type === 'pen') query = { postType: 'pen' };
    else return res.status(400).json({ message: 'Invalid type' });

    const limit = type === 'image' ? 50 : 10;

    const posts = await Post.find(query)
      .populate('author', 'fullName username profilePic allowAds adImpressions')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const formattedPosts = posts.map(post => ({
      ...post,
      likesCount: post.reactions ? post.reactions.length : 0,
      hasLiked: post.reactions?.some(r => r.user.toString() === req.user.id)
    }));

    res.status(200).json(formattedPosts);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    React to a post
// @route   POST /api/posts/:postId/react
const reactToPost = async (req, res) => {
  try {
    const { type } = req.body;
    const post = await Post.findById(req.params.postId);

    if (!post) return res.status(404).json({ message: 'Post not found' });

    const existingReactionIndex = post.reactions.findIndex(
      r => r.user.toString() === req.user.id
    );

    if (existingReactionIndex > -1) {
      if (post.reactions[existingReactionIndex].type === type) {
        post.reactions.splice(existingReactionIndex, 1);
      } else {
        post.reactions[existingReactionIndex].type = type;
      }
    } else {
      post.reactions.push({ user: req.user.id, type: type || 'love' });
    }

    await post.save();
    res.status(200).json({ message: 'Reaction updated', reactions: post.reactions });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get User Posts
// @route   GET /api/posts/user/:userId
const getUserPosts = async (req, res) => {
  try {
    const posts = await Post.find({ author: req.params.userId })
      .populate('author', 'fullName username profilePic')
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json(posts);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { createPost, getTopPosts, reactToPost, getUserPosts };
