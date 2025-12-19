const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database connection
const pool = mysql.createPool({
  host: process.env.MYSQL_HOSTNAME,
  port: process.env.MYSQL_PORT || 3306,
  user: process.env.MYSQL_USERNAME,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE || 'if0_40393000_yt_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// YouTube API configuration
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_API_URL = 'https://www.googleapis.com/youtube/v3';

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

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

// Routes

// 1. Register
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    // Check if user exists
    const [existing] = await pool.execute(
      'SELECT * FROM users WHERE email = ? OR username = ?',
      [email, username]
    );
    
    if (existing.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Insert user
    const [result] = await pool.execute(
      'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
      [username, email, hashedPassword]
    );
    
    // Generate JWT token
    const token = jwt.sign(
      { id: result.insertId, username, email },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.json({ 
      message: 'Registration successful',
      token,
      user: { id: result.insertId, username, email }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// 2. Login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Find user
    const [users] = await pool.execute(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );
    
    if (users.length === 0) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }
    
    const user = users[0];
    
    // Verify password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, username: user.username, email: user.email },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// 3. Search Videos
app.get('/api/search', async (req, res) => {
  try {
    const { q, maxResults = 20 } = req.query;
    
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
      thumbnail: item.snippet.thumbnails.medium.url,
      channelTitle: item.snippet.channelTitle,
      publishedAt: item.snippet.publishedAt
    }));
    
    res.json(videos);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// 4. Get Video Details
app.get('/api/video/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
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
    
    res.json({
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
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch video' });
  }
});

// 5. Add to History
app.post('/api/history', authenticateToken, async (req, res) => {
  try {
    const { video_id, video_title, thumbnail_url, search_query, action_type } = req.body;
    const userId = req.user.id;
    
    await pool.execute(
      `INSERT INTO history (user_id, video_id, video_title, thumbnail_url, search_query, action_type) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, video_id, video_title, thumbnail_url, search_query, action_type]
    );
    
    res.json({ message: 'History saved' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to save history' });
  }
});

// 6. Get User History
app.get('/api/history', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const [history] = await pool.execute(
      'SELECT * FROM history WHERE user_id = ? ORDER BY watched_at DESC LIMIT 50',
      [userId]
    );
    
    res.json(history);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// 7. Get Popular Videos
app.get('/api/popular', async (req, res) => {
  try {
    const response = await axios.get(`${YOUTUBE_API_URL}/videos`, {
      params: {
        part: 'snippet,contentDetails,statistics',
        chart: 'mostPopular',
        regionCode: 'US',
        maxResults: 20,
        key: YOUTUBE_API_KEY
      }
    });
    
    const videos = response.data.items.map(video => ({
      id: video.id,
      title: video.snippet.title,
      description: video.snippet.description,
      thumbnail: video.snippet.thumbnails.medium.url,
      channelTitle: video.snippet.channelTitle,
      publishedAt: video.snippet.publishedAt,
      viewCount: video.statistics.viewCount,
      duration: video.contentDetails.duration
    }));
    
    res.json(videos);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch popular videos' });
  }
});

// 8. Add to Favorites
app.post('/api/favorites', authenticateToken, async (req, res) => {
  try {
    const { video_id, video_title, thumbnail_url } = req.body;
    const userId = req.user.id;
    
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
    
    res.json({ message: 'Added to favorites' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to add to favorites' });
  }
});

// 9. Get Favorites
app.get('/api/favorites', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const [favorites] = await pool.execute(
      'SELECT * FROM favorites WHERE user_id = ? ORDER BY added_at DESC',
      [userId]
    );
    
    res.json(favorites);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch favorites' });
  }
});

// 10. Delete from History
app.delete('/api/history/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    await pool.execute(
      'DELETE FROM history WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    
    res.json({ message: 'History item deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to delete history' });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Export for Vercel
module.exports = app;
