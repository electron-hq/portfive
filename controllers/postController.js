const Post = require('../models/Post');
const cloudinary = require('../config/cloudinary');
const streamifier = require('streamifier');

// Helper: Upload to Cloudinary
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

// @desc    Create a new Image/Video Post
// @route   POST /api/posts
const createPost = async (req, res) => {
  try {
    const { caption, description } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ message: 'Media file is required' });
    }

    const result = await uploadToCloudinary(req.file.buffer);
    const mediaType = result.resource_type === 'video' ? 'video' : 'image';

    const newPost = await Post.create({
      author: req.user.id,
      mediaUrl: result.secure_url,
      mediaType,
      caption: caption || '',
      description: description || ''
    });

    res.status(201).json({ message: 'Post created successfully!', post: newPost });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error while creating post' });
  }
};

// @desc    Get Feed (Infinite Scroll Pagination)
// @route   GET /api/posts
const getFeed = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5; // 1-1 scroller e 5 ta post enough
    const skip = (page - 1) * limit;

    const posts = await Post.find()
      .populate('author', 'fullName username profilePic')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Add a flag if current user liked/reacted
    const formattedPosts = posts.map(post => {
      return {
        ...post,
        likesCount: post.reactions ? post.reactions.length : 0,
        hasLiked: post.reactions?.some(r => r.user.toString() === req.user.id)
      };
    });

    res.status(200).json(formattedPosts);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error while fetching feed' });
  }
};

// @desc    React to a post (Love, Wow, etc.)
// @route   POST /api/posts/:postId/react
const reactToPost = async (req, res) => {
  try {
    const { type } = req.body; // 'love', 'wow', 'care'
    const post = await Post.findById(req.params.postId);

    if (!post) return res.status(404).json({ message: 'Post not found' });

    const existingReactionIndex = post.reactions.findIndex(
      r => r.user.toString() === req.user.id
    );

    if (existingReactionIndex > -1) {
      if (post.reactions[existingReactionIndex].type === type) {
        // Remove reaction if clicking same type
        post.reactions.splice(existingReactionIndex, 1);
      } else {
        // Update reaction
        post.reactions[existingReactionIndex].type = type;
      }
    } else {
      // Add new reaction
      post.reactions.push({ user: req.user.id, type: type || 'love' });
    }

    await post.save();
    res.status(200).json({ message: 'Reaction updated', reactions: post.reactions });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { createPost, getFeed, reactToPost };
