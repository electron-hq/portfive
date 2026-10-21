const Post = require('../models/Post');
const cloudinary = require('../config/cloudinary');
const streamifier = require('streamifier');

// Helper: Upload to Cloudinary (For Images & Pen Covers)
const uploadToCloudinary = (buffer) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: 'portfive_posts', resource_type: 'auto' },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
};

// @desc    Create a new Post
// @route   POST /api/posts
const createPost = async (req, res) => {
  try {
    const { postType, title, content, caption, videoUrl } = req.body;
    
    let mediaUrl = videoUrl || "";
    let mediaType = postType === 'video' ? 'video' : 'image';

    // If a file is uploaded (Images for Image tab, Cover for Pen tab)
    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer);
      mediaUrl = result.secure_url;
      // If it's a pen cover, mediaType should be image
      if (postType === 'pen') mediaType = 'image';
    } 
    else if (postType === 'image' && !req.file) {
      return res.status(400).json({ message: 'Image file is required' });
    }
    else if (postType === 'video' && !videoUrl) {
      return res.status(400).json({ message: 'Video link is required' });
    }

    const newPost = await Post.create({
      author: req.user.id,
      postType: postType || 'image',
      title: title || "",
      content: content || "",
      mediaUrl,
      mediaType,
      caption: caption || ""
    });

    res.status(201).json({ message: 'Post created!', post: newPost });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
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
