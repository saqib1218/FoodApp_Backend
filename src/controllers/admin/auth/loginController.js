const bcrypt = require('bcryptjs');
const pool = require('../../../config/database');
const BusinessError = require('../../../lib/businessErrors');
const { sendSuccess } = require('../../../utils/responseHelpers');
const { generateAccessToken, generateRefreshToken, decodeToken } = require('../../../utils/jwt');
const { validateRequiredFields, validateEmail } = require('../../../utils/validation');

exports.adminUserLogin = async (req, res, next) => {
  const startTime = Date.now();

  try {
    const { email, password } = req.body;

    // 1️⃣ Validate required fields
    const missingFields = validateRequiredFields(req.body, ['email', 'password']);
    if (missingFields.length > 0) {
      throw new BusinessError('MISSING_REQUIRED_FIELDS', {
        details: { fields: missingFields },
        traceId: req.traceId,
        retryable: true,
      });
    }

    // 1.5️⃣ Validate email format
    if (!validateEmail(email)) {
      throw new BusinessError('INVALID_EMAIL_FORMAT', { details: { email }, traceId: req.traceId, retryable: true });
    }

    // 2️⃣ Find the user
    const userResult = await pool.query(
      `SELECT id, name, email, phone, password_hash, is_active
       FROM admin_users
       WHERE email = $1 AND deleted_at IS NULL
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

// Roles query
const rolesResult = await pool.query(
  `SELECT r.name
   FROM admin_roles r
   INNER JOIN admin_user_roles ur ON ur.role_id = r.id
   WHERE ur.admin_user_id = $1`,
  [user.id]
);
const roles = rolesResult.rows.map(r => r.name); // ["SuperAdmin"]

// Permissions query
const permResult = await pool.query(
  `SELECT DISTINCT p.key
   FROM admin_permissions p
   INNER JOIN admin_role_permissions rp ON rp.permission_id = p.id
   INNER JOIN admin_user_roles ur ON ur.role_id = rp.role_id
   WHERE ur.admin_user_id = $1`,
  [user.id]
);
const permissions = permResult.rows.length > 0 ? permResult.rows.map(r => r.key) : null;

// Token payload
const userForToken = {
  userId: user.id,
  email: user.email,
  phone: user.phone, // can be null
  roles,             // ["SuperAdmin"]
  permissions,       // null if none
  is_active: user.is_active
};

const accessToken = generateAccessToken(userForToken);
console.log('Decoded Access Token:', decodeToken(accessToken));

    const refreshToken = generateRefreshToken({ userId: user.id }); // lightweight

    // 7️⃣ Save refresh token in DB
    const decodedRefresh = decodeToken(refreshToken);
    const decodedAccess = decodeToken(accessToken);
    console.log('Decoded Access Token:', decodedAccess); // ✅ log payload
    const refreshTokenExpiry = new Date(decodedRefresh.exp * 1000);

    await pool.query(
      'INSERT INTO admin_user_auth (admin_user_id, refresh_token, expires_at) VALUES ($1, $2, $3)',
      [user.id, refreshToken, refreshTokenExpiry]
    );

    // 8️⃣ Set refresh token in secure HttpOnly cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      expires: refreshTokenExpiry,
    });

    // 9️⃣ Send response with access token
    return sendSuccess(
      res,
      'USER_LOGIN_SUCCESS',
      {
        access_token: accessToken,
        meta: { duration_ms: Date.now() - startTime },
      },
      req.traceId
    );

  } catch (err) {
    return next(err);
  }
};
