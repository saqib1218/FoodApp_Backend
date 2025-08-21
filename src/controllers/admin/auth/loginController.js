const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const pool = require('../../../config/database');
const BusinessError = require('../../../lib/businessErrors');
const { sendSuccess } = require('../../../utils/responseHelpers');
const { generateAccessToken, generateRefreshToken } = require('../../../utils/jwt');



exports.adminUserLogin = async (req, res, next) => {
  const startTime = Date.now();

  try {
    const { email, password } = req.body;

    // 1️⃣ Validate required fields
    if (!email || !password) {
      throw new BusinessError('MISSING_REQUIRED_FIELDS', {
        details: { fields: ['email', 'password'] },
        traceId: req.traceId,
        retryable: true,
      });
    }

    // 2️⃣ Find the admin user with password hash and role
    const userResult = await pool.query(
      `SELECT u.id, u.name, u.email, u.password_hash, u.is_active, r.name AS role
       FROM admin_users u
       LEFT JOIN admin_user_roles ur ON u.id = ur.admin_user_id
       LEFT JOIN admin_roles r ON ur.role_id = r.id
       WHERE u.email = $1 AND u.deleted_at IS NULL
       LIMIT 1`,
      [email]
    );

    const user = userResult.rows[0];
    if (!user) {
      throw new BusinessError('INVALID_CREDENTIALS', { traceId: req.traceId });
    }

    // 3️⃣ Compare password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      throw new BusinessError('INVALID_CREDENTIALS', { traceId: req.traceId });
    }

    // 4️⃣ Generate tokens using utility functions
    const userForToken = { id: user.id, phone: user.email }; // Using email as phone for compatibility
    const accessToken = generateAccessToken(userForToken);
    const refreshToken = generateRefreshToken(userForToken);


    // 6️⃣ Save refresh token in DB (multi-device support)
    // Note: JWT refresh tokens are self-contained, but we still store them for revocation support
    const { decodeToken } = require('../../../utils/jwt');
    const decoded = decodeToken(refreshToken);
    const refreshTokenExpiry = new Date(decoded.exp * 1000);
    
    await pool.query(
      'INSERT INTO admin_user_auth (admin_user_id, refresh_token, expires_at) VALUES ($1, $2, $3)',
      [user.id, refreshToken, refreshTokenExpiry]
    );

    // 7️⃣ Set refresh token in secure HttpOnly cookie (NOT in JSON response)
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,       // cannot be accessed by JavaScript
      secure: process.env.NODE_ENV === "production", // only over HTTPS in prod
      sameSite: "strict",   // prevents CSRF
      expires: new Date(refreshTokenExpiry), // cookie expiry matches DB expiry
    });

    // 8️⃣ Send success response (only access token + user info)
    return sendSuccess(
      res,
      'USER_LOGIN_SUCCESS',
      {
        access_token: accessToken,
        access_token_expires_in: 3600, // seconds
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          is_active: user.is_active,
          role: user.role,
        },
        meta: { duration_ms: Date.now() - startTime },
      },
      req.traceId
    );

  } catch (err) {
    return next(err);
  }
};
