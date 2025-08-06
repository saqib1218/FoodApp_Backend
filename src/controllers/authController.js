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
      return res.status(400).json({ success: false, error: { message: 'Number already exists', userId: result.rows[0].id } });
    }
    // Here, you would send an OTP to the mobile number (mocked)
    return res.json({ success: true, message: 'OTP sent successfully' });
  } catch (error) {
    if (error.code === '23505') {
      // Unique violation
      return res.status(400).json({ success: false, error: { message: 'Mobile number already exists' } });
    }
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
    let userResult;
    try {
      userResult = await pool.query(
        'INSERT INTO users (mobileNumber, pin, name, email, role, refresh_token) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, mobileNumber, name, email, role, created_at',
        [mobileNumber, hashedPin, name, email, 'owner', refreshToken]
      );
    } catch (dbError) {
      if (dbError.code === '23505') {
        // Unique violation (email or mobile number)
        let message = 'Duplicate entry';
        if (dbError.detail && dbError.detail.includes('email')) {
          message = 'Email already exists';
        } else if (dbError.detail && dbError.detail.includes('mobileNumber')) {
          message = 'Mobile number already exists';
        }
        return res.status(400).json({ success: false, error: { message } });
      }
      throw dbError;
    }
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

// 3. Login with mobileNumber, pin, and deviceId
exports.loginWithPhone = async (req, res) => {
  try {
    const { mobileNumber, pin, deviceId } = req.body;
    if (!mobileNumber || !pin || !deviceId) {
      return res.status(400).json({ success: false, error: { message: 'Mobile number, pin, and deviceId are required' } });
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
    // Check device
    const deviceResult = await pool.query('SELECT device_id FROM user_devices WHERE user_id = $1', [user.id]);
    if (deviceResult.rows.length > 0 && deviceResult.rows[0].device_id === deviceId) {
      // Device matches, login directly
      const accessToken = generateToken(user.id);
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
    } else {
      // Device mismatch or not registered, send OTP (hardcoded)
      return res.json({ success: false, otpRequired: true, message: 'OTP sent successfully' });
    }
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ success: false, error: { message: 'Internal server error' } });
  }
};

// 3b. OTP Verification and Device Registration (hardcoded OTP)
exports.verifyOtpAndRegisterDevice = async (req, res) => {
  try {
    const { mobileNumber, otp, deviceId } = req.body;
    if (!mobileNumber || !otp || !deviceId) {
      return res.status(400).json({ success: false, message: 'Mobile number, otp, and deviceId are required' });
    }
    if (otp !== '123456') {
      return res.status(400).json({ success: false, message: 'Invalid OTP' });
    }
    // Get user ID
    const userResult = await pool.query('SELECT id, mobileNumber, role FROM users WHERE mobileNumber = $1', [mobileNumber]);
    if (userResult.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'User not found' });
    }
    const userId = userResult.rows[0].id;
    // Upsert device
    await pool.query(
      `INSERT INTO user_devices (user_id, device_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET device_id = EXCLUDED.device_id, created_at = CURRENT_TIMESTAMP`,
      [userId, deviceId]
    );
    // Generate tokens
    const accessToken = generateToken(userId);
    const refreshToken = crypto.randomBytes(40).toString('hex');
    await pool.query('UPDATE users SET refresh_token = $1 WHERE id = $2', [refreshToken, userId]);
    return res.json({
      success: true,
      message: 'Device registered and login successful',
      data: {
        user: { id: userId, mobileNumber: userResult.rows[0].mobileNumber, role: userResult.rows[0].role },
        accessToken,
        refreshToken
      }
    });
  } catch (error) {
    console.error('OTP verification error:', error);
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