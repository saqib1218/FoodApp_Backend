const { pool } = require('../config/database');
const bcrypt = require('bcryptjs');
const { generateToken } = require('../utils/jwt');
const crypto = require('crypto');

// 1. Check if mobileNumber exists and send OTP (mocked)
exports.signupPhone = async (req, res) => {
  try {
    const { mobileNumber } = req.body;
    if (!mobileNumber) {
      return res.status(400).json({ success: false, error: { message: 'Mobile number is required' } });
    }
    const result = await pool.query('SELECT id FROM users WHERE mobileNumber = $1', [mobileNumber]);
    if (result.rows.length > 0) {
      return res.status(400).json({ success: false, error: { message: 'Number already exists' , userId: result.rows[0].id} });
    }
    // Here, you would send an OTP to the mobile number (mocked)
    return res.json({ success: true, message: 'OTP sent successfully' });
  } catch (error) {
    console.error('Signup phone error:', error);
    return res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};

// 2. Complete signup with mobileNumber and pin
exports.completeSignup = async (req, res) => {
  try {
    const { mobileNumber, pin, name, email } = req.body;
    if (!mobileNumber || !pin || !name || !email) {
      return res.status(400).json({ success: false, error: { message: 'Mobile number, pin, name, and email are required' } });
    }
    const result = await pool.query('SELECT id FROM users WHERE mobileNumber = $1', [mobileNumber]);
    if (result.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Number already exists',
          userId: result.rows[0].id
        }
      });
    }
    const saltRounds = 12;
    const hashedPin = await bcrypt.hash(pin, saltRounds);
    // Generate refresh token
    const refreshToken = crypto.randomBytes(40).toString('hex');
    const userResult = await pool.query(
      'INSERT INTO users (mobileNumber, pin, name, email, role, refresh_token) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, mobileNumber, name, email, role, created_at',
      [mobileNumber, hashedPin, name, email, 'owner', refreshToken]
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

// 3. Login with mobileNumber and pin
exports.loginWithPhone = async (req, res) => {
  try {
    const { mobileNumber, pin } = req.body;
    if (!mobileNumber || !pin) {
      return res.status(400).json({ success: false, error: { message: 'Mobile number and pin are required' } });
    }
    const result = await pool.query('SELECT id, mobileNumber, pin, role FROM users WHERE mobileNumber = $1', [mobileNumber]);
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, error: { message: 'Invalid credentials' } });
    }
    const user = result.rows[0];
    const isPinValid = await bcrypt.compare(pin, user.pin);
    if (!isPinValid) {
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
        user: { id: user.id, mobileNumber: user.mobileNumber, role: user.role },
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