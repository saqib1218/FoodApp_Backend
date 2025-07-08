const { pool } = require('../config/database');
const bcrypt = require('bcryptjs');
const { generateToken } = require('../utils/jwt');
const crypto = require('crypto');

// 1. Check if phone number exists and send OTP (mocked)
exports.signupPhone = async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ success: false, error: { message: 'Phone number is required' } });
    }
    const result = await pool.query('SELECT id FROM users WHERE phone = $1', [phone]);
    if (result.rows.length > 0) {
      return res.status(400).json({ success: false, error: { message: 'Number already exists' } });
    }
    // Here, you would send an OTP to the phone number (mocked)
    return res.json({ success: true, message: 'OTP sent successfully' });
  } catch (error) {
    console.error('Signup phone error:', error);
    return res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};

// 2. Complete signup with phone, password, and confirm password
exports.completeSignup = async (req, res) => {
  try {
    const { phone, password, confirmPassword } = req.body;
    if (!phone || !password || !confirmPassword) {
      return res.status(400).json({ success: false, error: { message: 'Phone, password, and confirm password are required' } });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, error: { message: 'Passwords do not match' } });
    }
    const result = await pool.query('SELECT id FROM users WHERE phone = $1', [phone]);
    if (result.rows.length > 0) {
      return res.status(400).json({ success: false, error: { message: 'Number already exists' } });
    }
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    // Generate refresh token
    const refreshToken = crypto.randomBytes(40).toString('hex');
    const userResult = await pool.query(
      'INSERT INTO users (phone, password, role, refresh_token) VALUES ($1, $2, $3, $4) RETURNING id, phone, role, created_at',
      [phone, hashedPassword, 'user', refreshToken]
    );
    const user = userResult.rows[0];
    // Generate access token
    const accessToken = generateToken(user.id);
    return res.status(201).json({
      success: true,
      message: 'Signup successful',
      data: {
        user,
        accessToken,
        refreshToken
      }
    });
  } catch (error) {
    console.error('Complete signup error:', error);
    return res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};

// 3. Login with phone and password
exports.loginWithPhone = async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) {
      return res.status(400).json({ success: false, error: { message: 'Phone and password are required' } });
    }
    const result = await pool.query('SELECT id, phone, password, role FROM users WHERE phone = $1', [phone]);
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, error: { message: 'Invalid credentials' } });
    }
    const user = result.rows[0];
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ success: false, error: { message: 'Invalid credentials' } });
    }
    // Generate access token
    const accessToken = generateToken(user.id);
    // Generate new refresh token and update in DB
    const refreshToken = crypto.randomBytes(40).toString('hex');
    await pool.query('UPDATE users SET refresh_token = $1 WHERE id = $2', [refreshToken, user.id]);
    return res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: { id: user.id, phone: user.phone, role: user.role },
        accessToken,
        refreshToken
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};

// 4. Refresh token endpoint
exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ success: false, error: { message: 'Refresh token is required' } });
    }
    // Find user by refresh token
    const result = await pool.query('SELECT id FROM users WHERE refresh_token = $1', [refreshToken]);
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, error: { message: 'Invalid refresh token' } });
    }
    const user = result.rows[0];
    // Generate new access token
    const accessToken = generateToken(user.id);
    return res.json({ success: true, accessToken });
  } catch (error) {
    console.error('Refresh token error:', error);
    return res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
}; 