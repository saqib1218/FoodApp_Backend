const { pool } = require('../config/database');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { generateToken } = require('../utils/jwt');
const crypto = require('crypto');
const { saveOtp, sendOtp, generateOtp,getLatestOtpEntry,verifyOtp  } = require('../utils/Otp');
// 1. Check if mobileNumber exists and send OTP (mocked)
const { validatePhoneNumber } = require("../utils/validation");

exports.signupPhone = async (req, res) => {
  try {
    const { phone } = req.body;

    // ✅ Missing phone
    if (!phone) {
      return res.status(400).json({
        success: false,
        error: {
          code: "PHONE_REQUIRED",
          message: "Phone number is required"
        }
      });
    }

    // ✅ Invalid format
    if (!validatePhoneNumber(phone)) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_PHONE_FORMAT",
          message: "Invalid phone number format. Use +92XXXXXXXXXX format"
        }
      });
    }

    // ✅ Already exists
    const result = await pool.query(
      'SELECT id FROM kitchen_users WHERE phone = $1',
      [phone]
    );
    if (result.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: {
          code: "PHONE_ALREADY_EXISTS",
          message: "Number already exists",
          userId: result.rows[0].id
        }
      });
    }

    // ✅ Generate OTP
    const otp = generateOtp();

    // ✅ Save OTP
    const otpResult = await saveOtp({
      identity: phone,
      otp_code: otp,
      otpType: 'signup',
    });

    // Too many attempts
    if (!otpResult.success) {
      return res.status(429).json({
        success: false,
        error: {
          code: "OTP_ATTEMPTS_EXCEEDED",
          message: otpResult.error,
          retry_after_seconds: otpResult.retry_after_seconds
        }
      });
    }

    // ✅ Send OTP (for now, just console log)
    await sendOtp({ identity: phone, otp_code: otp });

    // ✅ Success response with full OTP details in `data`
    return res.status(200).json({
      success: true,
      message: 'OTP sent successfully',
      data: {
        otp_id: otpResult.otp_id,
        otp_type: otpResult.otp_type,
        expires_in: otpResult.expires_at,      // 5 min expiry
        max_trials: otpResult.max_trials,
        status: otpResult.status
      }
    });

  } catch (error) {
    console.error('Signup phone error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: "SERVER_ERROR",
        message: "Internal server error"
      }
    });
  }
};






exports.verifyPhoneOtpHandler = async (req, res) => {
  const { otp_id, identity, otp_code, otp_type } = req.body;

  // 🚫 Validate required fields
  if (!otp_id || !identity || !otp_code || !otp_type) {
    return res.status(400).json({
      success: false,
      error_code: "VALIDATION_FAILED",
      message: "Required fields are missing (otp_id, identity, otp_code, otp_type).",
      data: null
    });
  }

  // 🔒 Validate phone format
  if (!validatePhoneNumber(identity)) {
    return res.status(400).json({
      success: false,
      error_code: "INVALID_PHONE_FORMAT",
      message: "Phone number must be in +92XXXXXXXXXX format.",
      data: null
    });
  }

  try {
    // Pass otp_id to verification logic
const result = await verifyOtp({ otp_id, identity, otp_code, otp_type });
// ✅ Pass correct args

    if (!result.success) {
      let statusCode;
      let errorCode;

      switch (result.code) {
        case "EXPIRED":
          statusCode = 410;
          errorCode = "OTP_EXPIRED";
          break;
        case "SERVER_ERROR":
          statusCode = 500;
          errorCode = "OTP_SERVER_ERROR";
          break;
        case "NOT_FOUND":
          statusCode = 404;
          errorCode = "OTP_NOT_FOUND";
          break;
        default:
          statusCode = 400;
          errorCode = result.code || "OTP_VERIFICATION_FAILED";
      }

      return res.status(statusCode).json({
        success: false,
        error_code: errorCode,
        message: "OTP verification failed.",
        data: null
      });
    }

    const updatedOtp = result.otpRecord;
    const now = updatedOtp.verified_at;
    const phone = updatedOtp.identity;

    // ✅ Save to kitchen_users (and return user_id)
    const { rows: userRows } = await pool.query(
      `INSERT INTO kitchen_users (phone, verified_at, updated_at, status)
       VALUES ($1, $2, NOW(), 'pending')
       ON CONFLICT (phone)
       DO UPDATE SET
         verified_at = EXCLUDED.verified_at,
         updated_at = NOW(),
         status = EXCLUDED.status
       RETURNING id AS user_id, phone, status, verified_at`,
      [phone, now]
    );
    const userData = userRows[0];

    return res.status(200).json({
      success: true,
      message: "Phone number verified and user created successfully.",
      data: {
      
        status: updatedOtp.status,  // ✅ from otp_requests
        verified_at: updatedOtp.verified_at,
        user_id: userData.user_id,
        phone_verified: true,
        user_created: true
      }
    });

  } catch (error) {
    console.error("Error in verifyPhoneOtpHandler:", error);
    return res.status(500).json({
      success: false,
      error_code: "INTERNAL_SERVER_ERROR",
      message: "Something went wrong while verifying the OTP. Please try again.",
      data: null
    });
  }
};










const MAX_TRIALS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes in ms
const OTP_EXPIRY_SECONDS = 60; // 1 minute expiry

exports.resendOtp = async (req, res) => {
  const { otp_id } = req.body;

  if (!otp_id) {
    return res.status(400).json({
      success: false,
      message: 'Missing otp_id',
    });
  }

  try {
    // Fetch the OTP record by otp_id
    const { rows } = await pool.query(
      `SELECT * FROM otp_requests WHERE id = $1`,
      [otp_id]
    );
    const otpRecord = rows[0];

    if (!otpRecord) {
      return res.status(404).json({
        success: false,
        message: 'OTP request not found',
      });
    }

    const now = Date.now();
    const createdAt = new Date(otpRecord.created_at).getTime();
    const timeSinceCreated = now - createdAt;

    // Check max trials and lockout
    if (otpRecord.trial_count >= MAX_TRIALS) {
      if (timeSinceCreated < LOCKOUT_DURATION) {
        const waitSeconds = Math.ceil((LOCKOUT_DURATION - timeSinceCreated) / 1000);
        return res.status(429).json({
          success: false,
          message: `Too many attempts. Please try again after ${waitSeconds} second(s).`,
        });
      } else {
        // Lockout expired: reset trial count and created_at to now
        await pool.query(
          `UPDATE otp_requests
           SET trial_count = 1, created_at = NOW(), expires_at = NOW() + INTERVAL '1 minute', otp_code = $1, status = 'resent'
           WHERE id = $2`,
          [generateOtp(), otp_id]
        );

        const updatedRow = await pool.query(`SELECT * FROM otp_requests WHERE id = $1`, [otp_id]);
        const updatedOtp = updatedRow.rows[0];

        return res.status(200).json({
          otp_id: updatedOtp.id,
          otp_type: updatedOtp.otp_type,
          status: updatedOtp.status,
          expires_in: OTP_EXPIRY_SECONDS,
        });
      }
    }

    // If trial count < max, just update trial count, otp_code, expires_at and status
    const newOtpCode = generateOtp();
    await pool.query(
      `UPDATE otp_requests
       SET trial_count = trial_count + 1,
           otp_code = $1,
           expires_at = NOW() + INTERVAL '1 minute',
           status = 'resent'
       WHERE id = $2`,
      [newOtpCode, otp_id]
    );

    const updatedRow = await pool.query(`SELECT * FROM otp_requests WHERE id = $1`, [otp_id]);
    const updatedOtp = updatedRow.rows[0];

    return res.status(200).json({
      otp_id: updatedOtp.id,
      otp_type: updatedOtp.otp_type,
      status: updatedOtp.status,
      expires_in: OTP_EXPIRY_SECONDS,
    });

  } catch (err) {
    console.error('Error in resendOtp:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: err.message,
    });
  }
};



exports.setPin = async (req, res) => {
  const { user_id, pin } = req.body;

  if (!user_id) {
    return res.status(400).json({
      success: false,
      error: "User ID is required.",
    });
  }

  if (!pin) {
    return res.status(400).json({
      success: false,
      error: "PIN is required.",
    });
  }

  try {
    const hashedPin = await bcrypt.hash(pin, 10);

    // Check if user exists in kitchen_users
    const existingUser = await pool.query(
      `SELECT * FROM kitchen_users WHERE id = $1`,
      [user_id]
    );

    if (existingUser.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "User not found.",
      });
    }

    // Update pin for that user
    await pool.query(
      `UPDATE kitchen_users SET pin = $1, updated_at = NOW() WHERE id = $2`,
      [hashedPin, user_id]
    );

    return res.json({
      success: true,
      message: "PIN set successfully.",
    });

  } catch (err) {
    console.error("Error setting PIN:", err);
    return res.status(500).json({
      success: false,
      error: "Internal server error.",
    });
  }
};


exports.submitOwnerDetails = async (req, res) => {
  const {
    name,
    email,
    gender,
    date_of_birth,
    bio,
    relation_to_primary_owner,
    is_primary_owner
  } = req.body;

  const phone = req.user.phone; // phone from token

  if (!name || !phone) {
    return res.status(400).json({ error: "Name and phone are required" });
  }

  if (!validatePhoneNumber(phone)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid phone number format. Use +92XXXXXXXXXX format.',
    });
  }

  try {
    // UPSERT into kitchen_users directly by phone (assuming phone unique)
    await pool.query(
      `INSERT INTO kitchen_users (
        name, phone, email, bio,
        is_primary_owner, relation_to_primary_owner,
        date_of_birth, gender,
        status, joined_at
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6,
        $7, $8,
        'active', NOW()
      )
      ON CONFLICT (phone) DO UPDATE SET
        name = EXCLUDED.name,
        email = EXCLUDED.email,
        bio = EXCLUDED.bio,
        is_primary_owner = EXCLUDED.is_primary_owner,
        relation_to_primary_owner = EXCLUDED.relation_to_primary_owner,
        date_of_birth = EXCLUDED.date_of_birth,
        gender = EXCLUDED.gender,
        status = 'active',
        updated_at = NOW()
      `,
      [
        name,
        phone,
        email,
        bio,
        is_primary_owner,
        is_primary_owner ? null : relation_to_primary_owner,
        date_of_birth,
        gender
      ]
    );

    return res.json({ message: "Owner details submitted and saved to kitchen_users ✅" });

  } catch (err) {
    console.error("❌ Error in submitOwnerDetails:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};



// Pseudo Express + Supabase style




// exports.signupPhone = async (req, res) => {
//   try {
//     const { mobileNumber } = req.body;
//     if (!mobileNumber) {
//       return res.status(400).json({ success: false, error: { message: 'Mobile number is required' } });
//     }
//     const result = await pool.query('SELECT id FROM users WHERE mobileNumber = $1', [mobileNumber]);
//     if (result.rows.length > 0) {
//       return res.status(400).json({ success: false, error: { message: 'Number already exists', userId: result.rows[0].id } });
//     }
//     // Here, you would send an OTP to the mobile number (mocked)
//     return res.json({ success: true, message: 'OTP sent successfully' });
//   } catch (error) {
//     if (error.code === '23505') {
//       // Unique violation
//       return res.status(400).json({ success: false, error: { message: 'Mobile number already exists' } });
//     }
//     console.error('Signup phone error:', error);
//     return res.status(500).json({ success: false, error: { message: 'Internal server error' } });
//   }
// };


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