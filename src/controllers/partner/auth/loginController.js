const { pool } = require('../../../config/database');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { generateToken } = require('../../../utils/jwt');
const crypto = require('crypto');
const { saveOtp, sendOtp, generateOtp,getLatestOtpEntry,verifyOtp  } = require('../../../utils/otp');





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