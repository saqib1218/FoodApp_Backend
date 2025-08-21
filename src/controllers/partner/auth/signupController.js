const { pool } = require('../../../config/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { saveOtp, sendOtp, verifyOtp } = require('../../../utils/otp');
const { validateMobileNumber, validateRequiredFields } = require("../../../utils/validation");
const BusinessError = require('../../../lib/businessErrors');
const { sendSuccess } = require('../../../utils/responseHelpers');
// If your roleService file is at ../../service/assignRoleToUser.js
const { assignRoleToUser } = require('../../../services/assignRoleToUser'); 


exports.signupMobileNumber = async (req, res, next) => {
  const startTime = Date.now();

  try {
    const { mobileNumber } = req.body;

    // 1️⃣ Validate required fields
    const missing = validateRequiredFields(req.body, ['mobileNumber']);
    if (missing.length) {
      throw new BusinessError('MISSING_REQUIRED_FIELDS', {
        details: {
          fields: missing.map(field => ({
            field,
            reason: 'REQUIRED',
            message: `${field} is required`
          })),
        },
        traceId: req.traceId,
        retryable: true,
      });
    }

    // 2️⃣ Validate mobile number format
    if (!validateMobileNumber(mobileNumber)) {
      throw new BusinessError('INVALID_MOBILE_NUMBER_FORMAT', {
        traceId: req.traceId,
        retryable: true,
      });
    }

    // 3️⃣ Check if user already exists
    const userResult = await pool.query(
      'SELECT id FROM kitchen_users WHERE phone = $1 AND deleted_at IS NULL',
      [mobileNumber]
    );

    if (userResult.rows.length > 0) {
      const user = userResult.rows[0];

      // ✅ Check if user has any invitation
      const inviteResult = await pool.query(
        'SELECT id FROM kitchen_user_invitations WHERE phone = $1 LIMIT 1',
        [mobileNumber]
      );
      const isInvited = inviteResult.rows.length > 0;

      // ✅ Generate JWT token for existing user
const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
res.setHeader('Authorization', `Bearer ${token}`);
console.log(token);

// ❌ Then you immediately throw a BusinessError
throw new BusinessError('USER_ALREADY_EXISTS', { traceId: req.traceId, details: { user_id: user.id, isInvited } });

    }

    // 4️⃣ Save OTP for new user
    const otpResult = await saveOtp({ identity: mobileNumber, otpType: 'signup' });

    // 5️⃣ Handle OTP still valid
    if (!otpResult.success && otpResult.reason === 'OTP_STILL_VALID') {
      throw new BusinessError('OTP_STILL_VALID', {
        details: { fields: [] },
        meta: otpResult.meta,
        retry_after_seconds: otpResult.meta.expires_in ?? 0,
        traceId: req.traceId,
        retryable: true,
      });
    }

    // 6️⃣ Handle OTP max attempts / lockout
    if (!otpResult.success && otpResult.reason === 'OTP_ATTEMPTS_EXCEEDED') {
      throw new BusinessError('OTP_ATTEMPTS_EXCEEDED', {
        message: otpResult.error,
        retry_after_seconds: otpResult.retry_after_seconds,
        traceId: req.traceId,
        retryable: true,
        meta: otpResult.meta,
      });
    }

    // 7️⃣ OTP successfully created / updated
    if (otpResult.success) {
      const expiresInSeconds = Math.max(0, Math.floor((new Date(otpResult.data.expires_at) - new Date()) / 1000));
      await sendOtp({ identity: mobileNumber, otp_code: otpResult.new_otp });

      // ✅ Use success catalog key for OTP
      return sendSuccess(res, 'OTP_SENT_SUCCESS', {
        otp_id: otpResult.data.id,
        otp_type: otpResult.data.otp_type,
        expires_in: expiresInSeconds,
        max_trials: otpResult.data.max_trials,
        status: otpResult.data.status,
        meta: { duration_ms: Date.now() - startTime }
      }, req.traceId);
    }

    // 8️⃣ Fallback
    throw new BusinessError('INTERNAL_ERROR', {
      message: 'Unable to process OTP',
      traceId: req.traceId,
      retryable: true,
    });

  } catch (err) {
    return next(err);
  }
};



exports.verifyMobileOtpHandler = async (req, res, next) => {
  try {
    const missing = validateRequiredFields(req.body, ['otp_id', 'otp_code']);
    if (missing.length) {
      throw new BusinessError('MISSING_REQUIRED_FIELDS', {
        details: { fields: missing.map(f => ({ field: f, reason: 'REQUIRED' })) },
        traceId: req.traceId,
      });
    }

    const { otp_id, otp_code } = req.body;

    const result = await verifyOtp({ otp_id, otp_code });

    if (!result.success) {
      const reasonMap = {
        WRONG_CODE: 'OTP_INVALID',
        OTP_EXPIRED: 'OTP_EXPIRED',
        TOO_MANY_ATTEMPTS: 'OTP_TOO_MANY_ATTEMPTS',
        ATTEMPTS_EXCEEDED: 'OTP_TOO_MANY_ATTEMPTS',
        OTP_STILL_VALID: 'OTP_STILL_VALID',
        OTP_NOT_FOUND: 'OTP_INVALID',
        SERVER_ERROR: 'SERVER_ERROR',
      };

      const errorCode = reasonMap[result.reason] || 'OTP_VERIFICATION_FAILED';

      throw new BusinessError(errorCode, {
        traceId: req.traceId,
        retryable: ['OTP_EXPIRED','OTP_TOO_MANY_ATTEMPTS','OTP_INVALID','OTP_STILL_VALID'].includes(errorCode),
        meta: result.meta || {}
      });
    }

    const phone = result.data.identity;

    const { rows: userRows } = await pool.query(
      `INSERT INTO kitchen_users (phone)
       VALUES ($1)
       ON CONFLICT (phone) DO NOTHING
       RETURNING id AS user_id, phone, pin`,
      [phone]
    );

    let userData;
    if (userRows.length === 0) {
      const existingUser = await pool.query(
        `SELECT id AS user_id, phone, pin FROM kitchen_users WHERE phone = $1`,
        [phone]
      );
      userData = existingUser.rows[0];
    } else {
      userData = userRows[0];
    }

    // ✅ Check if invitation code exists for this phone
    const { rows: invitationRows } = await pool.query(
      `SELECT invitation_code
       FROM kitchen_user_invitations
       WHERE phone = $1
         AND deleted_at IS NULL
         AND status = 'pending'
         AND expires_at > NOW()
       LIMIT 1`,
      [phone]
    );

    const hasInvitationCode = invitationRows.length > 0;

// Generate JWT token for client to use (expires in 1 hour)
const tokenPayload = { 
  userId: userData.user_id  // ✅ only userId, no pin
};
const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '1h' });

console.log(`Generated JWT token for: ${token}`);

// Send token in response header
res.setHeader('Authorization', `Bearer ${token}`);


    // Send success response
    return sendSuccess(res, 'MOBILE_VERIFIED_SUCCESS', {
  status: result.data.status,
  verified_at: result.data.verified_at,
  user_created: userRows.length > 0,
  hasInvitationCode
}, req.traceId);

  } catch (err) {
    next(err);
  }
};






exports.setPin = async (req, res, next) => {
  try {
    const { pin } = req.body;

    // 1️⃣ Validate required fields
    const missing = validateRequiredFields(req.body, ['pin']);
    if (missing.length) {
      return next(new BusinessError('MISSING_REQUIRED_FIELDS', {
        details: { fields: missing.map(f => ({ field: f, reason: 'REQUIRED' })) },
        traceId: req.traceId,
      }));
    }

    // 2️⃣ Use user info from middleware
    const { userId, pinSet } = req.user;

    if (pinSet) {
      return next(new BusinessError('USER_PIN_ALREADY_SET', { traceId: req.traceId }));
    }

    // 3️⃣ Get user's phone number
    const userResult = await pool.query(
      'SELECT phone FROM kitchen_users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return next(new BusinessError('USER_NOT_FOUND', { traceId: req.traceId }));
    }

    const phone = userResult.rows[0].phone;

    // 4️⃣ Check if user was invited
    const inviteResult = await pool.query(
      'SELECT id FROM kitchen_user_invitations WHERE phone = $1 LIMIT 1',
      [phone]
    );
    const isInvited = inviteResult.rows.length > 0;

    // 5️⃣ Hash the new PIN
    const hashedPin = await bcrypt.hash(pin, 10);

    // 6️⃣ Update user PIN in DB
    await pool.query(
      `UPDATE kitchen_users SET pin = $1 WHERE id = $2`,
      [hashedPin, userId]
    );

 return sendSuccess(res, 'USER_PIN_SET_SUCCESS', { isInvited }, req.traceId);  // ✅ Success


  } catch (err) {
    console.error("Error setting PIN:", err);
    return next(err);
  }
};






exports.submitOwnerDetails = async (req, res, next) => {
  // 1️⃣ Extract token from headers (Authorization: Bearer <token>)
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace('Bearer ', '').trim();

  if (!token) {
    return next(new BusinessError('UNAUTHORIZED', {
      message: 'Missing token',
      traceId: req.traceId,
      retryable: true
    }));
  }

  let userId;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET); // replace with your JWT secret
    userId = decoded.userId;
    if (!userId) {
      throw new Error('userId not found in token');
    }
  } catch (err) {
    return next(new BusinessError('INVALID_TOKEN', {
      message: 'Invalid or expired token',
      traceId: req.traceId,
      retryable: true
    }));
  }

  // 2️⃣ Define required fields excluding user_id
  const requiredFields = [
    'name',
    'email',
    'gender',
    'date_of_birth',
    'bio',
    'relation_to_primary_owner',
    'is_primary_owner'
  ];

  const missingFields = requiredFields.filter(field => !(field in req.body));
  if (missingFields.length > 0) {
    return next(new BusinessError('MISSING_REQUIRED_FIELDS', {
      message: "Please provide all required fields.",
      details: { fields: missingFields.map(f => ({ field: f, reason: 'REQUIRED' })) },
      traceId: req.traceId,
    }));
  }

  const {
    name,
    email,
    gender,
    date_of_birth,
    bio,
    relation_to_primary_owner,
    is_primary_owner
  } = req.body;

  const query = `
    UPDATE kitchen_users
    SET name = $1,
        email = $2,
        gender = $3,
        date_of_birth = $4,
        bio = $5,
        relation_to_primary_owner = $6,
        is_primary_owner = $7
    WHERE id = $8
    RETURNING *
  `;

  const values = [
    name,
    email,
    gender,
    date_of_birth,
    bio,
    relation_to_primary_owner,
    is_primary_owner,
    userId
  ];

  try {
    const result = await pool.query(query, values);

    if (result.rowCount === 0) {
      return next(new BusinessError('USER_NOT_FOUND', {
        message: 'Owner record not found.',
        traceId: req.traceId,
        retryable: true
      }));
    }
    
    // 3️⃣ Assign owner role using service function
    try {
      await assignRoleToUser(userId, 'owner');
    } catch (roleErr) {
      console.error('❌ Error assigning owner role:', roleErr);
      return next(new BusinessError('ROLE_ASSIGNMENT_FAILED', {
        message: 'Failed to assign owner role.',
        traceId: req.traceId,
        retryable: true
      }));
    }

    // 4️⃣ Exclude pin from the response
    const { pin, ...safeData } = result.rows[0];

    return sendSuccess(res, 'USER_PROFILE_UPDATED_SUCCESS', safeData, req.traceId);
  } catch (err) {
    console.error("❌ Error in submitOwnerDetails:", err);
    return next(err);
  }
};

