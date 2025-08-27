const bcrypt = require('bcryptjs');
const pool = require('../../../config/database');
const BusinessError = require('../../../lib/businessErrors');
const { sendSuccess } = require('../../../utils/responseHelpers');
const { generateAccessToken, decodeToken } = require('../../../utils/jwt');
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
      `SELECT id, name, email, phone, password_hash, is_active, deleted_at
       FROM admin_users
       WHERE email = $1
       LIMIT 1`,
      [email]
    );
    const user = userResult.rows[0];

    if (!user || user.deleted_at !== null || user.is_active === false) {
      throw new BusinessError('USER_INACTIVE', { traceId: req.traceId });
    }

    // 3️⃣ Compare password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      throw new BusinessError('INVALID_CREDENTIALS', { traceId: req.traceId });
    }

    // 4️⃣ Fetch the user's role (single active and non-deleted role)
    const roleResult = await pool.query(
      `SELECT r.id, r.name, r.is_active, r.deleted_at
       FROM admin_roles r
       INNER JOIN admin_user_roles ur ON ur.role_id = r.id
       WHERE ur.admin_user_id = $1
       AND r.is_active = TRUE
       AND r.deleted_at IS NULL
       LIMIT 1`,
      [user.id]
    );
    const role = roleResult.rows[0];

    if (!role) {
      throw new BusinessError('USER_INACTIVE', { traceId: req.traceId });
    }

    // 5️⃣ Generate access token (single role)
    const userForToken = {
      userId: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      isActive: user.is_active,
      role: role.name,
    };

    const accessToken = generateAccessToken(userForToken);
    console.log('Decoded Access Token:', decodeToken(accessToken));

    // 6️⃣ Send response
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
