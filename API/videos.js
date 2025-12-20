const express = require('express');
const axios = require('axios');
const pool = require('./database');
const jwt = require('jsonwebtoken');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_API_URL = 'https://www.googleapis.com/youtube/v3';

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access token required' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

// Search videos
router.get('/search', async (req, res) => {
  try {
    const { q, maxResults = 20 } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'Search query is required' });
    }
    
    if (!YOUTUBE_API_KEY) {
      return res.status(500).json({ error: 'YouTube API key not configured' });
    }
    
    const response = await axios.get(`${YOUTUBE_API_URL}/search`, {
      params: {
        part: 'snippet',
        q,
        maxResults,
        type: 'video',
        key: YOUTUBE_API_KEY
      }
    });
    
    const videos = response.data.items.map(item => ({
      id: item.id.videoId,
      title: item.snippet.title,
      description: item.snippet.description,
      thumbnail: item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default.url,
      channelTitle: item.snippet.channelTitle,
      publishedAt: item.snippet.publishedAt
    }));
    
    res.json({ success: true, videos });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ 
      error: 'Search failed', 
      details: error.message 
    });
  }
});

// Get video details
router.get('/video/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!YOUTUBE_API_KEY) {
      return res.status(500).json({ error: 'YouTube API key not configured' });
    }
    
    const response = await axios.get(`${YOUTUBE_API_URL}/videos`, {
      params: {
        part: 'snippet,contentDetails,statistics',
        id,
        key: YOUTUBE_API_KEY
      }
    });
    
    if (response.data.items.length === 0) {
      return res.status(404).json({ error: 'Video not found' });
    }
    
    const video = response.data.items[0];
    
    const videoData = {
      id: video.id,
      title: video.snippet.title,
      description: video.snippet.description,
      thumbnail: video.snippet.thumbnails.standard?.url || video.snippet.thumbnails.high.url,
      channelTitle: video.snippet.channelTitle,
      publishedAt: video.snippet.publishedAt,
      duration: video.contentDetails.duration,
      viewCount: video.statistics.viewCount,
      likeCount: video.statistics.likeCount,
      commentCount: video.statistics.commentCount
    };
    
    res.json({ success: true, video: videoData });
  } catch (error) {
    console.error('Video fetch error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch video', 
      details: error.message 
    });
  }
});

// Get popular videos
router.get('/popular', async (req, res) => {
  try {
    const { maxResults = 20 } = req.query;
    
    if (!YOUTUBE_API_KEY) {
      return res.status(500).json({ error: 'YouTube API key not configured' });
    }
    
    const response = await axios.get(`${YOUTUBE_API_URL}/videos`, {
      params: {
        part: 'snippet,contentDetails,statistics',
        chart: 'mostPopular',
        regionCode: 'US',
        maxResults,
        key: YOUTUBE_API_KEY
      }
    });
    
    const videos = response.data.items.map(video => ({
      id: video.id,
      title: video.snippet.title,
      description: video.snippet.description,
      thumbnail: video.snippet.thumbnails.medium?.url || video.snippet.thumbnails.default.url,
      channelTitle: video.snippet.channelTitle,
      publishedAt: video.snippet.publishedAt,
      viewCount: video.statistics.viewCount,
      duration: video.contentDetails.duration
    }));
    
    res.json({ success: true, videos });
  } catch (error) {
    console.error('Popular videos error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch popular videos', 
      details: error.message 
    });
  }
});

// Add to history
router.post('/history', authenticateToken, async (req, res) => {
  try {
    const { video_id, video_title, thumbnail_url, search_query, action_type } = req.body;
    const userId = req.user.id;
    
    if (!video_id && !search_query) {
      return res.status(400).json({ error: 'Video ID or search query is required' });
    }
    
    await pool.execute(
      `INSERT INTO history (user_id, video_id, video_title, thumbnail_url, search_query, action_type) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, video_id || '', video_title || '', thumbnail_url || '', search_query || '', action_type || 'watch']
    );
    
    res.json({ success: true, message: 'History saved' });
  } catch (error) {
    console.error('History save error:', error);
    res.status(500).json({ error: 'Failed to save history', details: error.message });
  }
});

// Get user history
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const [history] = await pool.execute(
      'SELECT * FROM history WHERE user_id = ? ORDER BY watched_at DESC LIMIT 50',
      [userId]
    );
    
    res.json({ success: true, history });
  } catch (error) {
    console.error('History fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch history', details: error.message });
  }
});

// Add to favorites
router.post('/favorites', authenticateToken, async (req, res) => {
  try {
    const { video_id, video_title, thumbnail_url } = req.body;
    const userId = req.user.id;
    
    if (!video_id) {
      return res.status(400).json({ error: 'Video ID is required' });
    }
    
    // Check if already in favorites
    const [existing] = await pool.execute(
      'SELECT * FROM favorites WHERE user_id = ? AND video_id = ?',
      [userId, video_id]
    );
    
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Already in favorites' });
    }
    
    await pool.execute(
      'INSERT INTO favorites (user_id, video_id, video_title, thumbnail_url) VALUES (?, ?, ?, ?)',
      [userId, video_id, video_title, thumbnail_url]
    );
    
    res.json({ success: true, message: 'Added to favorites' });
  } catch (error) {
    console.error('Add to favorites error:', error);
    res.status(500).json({ error: 'Failed to add to favorites', details: error.message });
  }
});

// Get favorites
router.get('/favorites', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const [favorites] = await pool.execute(
      'SELECT * FROM favorites WHERE user_id = ? ORDER BY added_at DESC',
      [userId]
    );
    
    res.json({ success: true, favorites });
  } catch (error) {
    console.error('Favorites fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch favorites', details: error.message });
  }
});

// Delete from history
router.delete('/history/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    const [result] = await pool.execute(
      'DELETE FROM history WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'History item not found' });
    }
    
    res.json({ success: true, message: 'History item deleted' });
  } catch (error) {
    console.error('History delete error:', error);
    res.status(500).json({ error: 'Failed to delete history', details: error.message });
  }
});

// Clear all history
router.delete('/history', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    await pool.execute(
      'DELETE FROM history WHERE user_id = ?',
      [userId]
    );
    
    res.json({ success: true, message: 'All history cleared' });
  } catch (error) {
    console.error('Clear history error:', error);
    res.status(500).json({ error: 'Failed to clear history', details: error.message });
  }
});

module.exports = router;
