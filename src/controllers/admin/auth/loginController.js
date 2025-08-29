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
    console.log('Login attempt for email:', email);

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
      throw new BusinessError('INVALID_EMAIL_FORMAT', {
        details: { email },
        traceId: req.traceId,
        retryable: true,
      });
    }

    // 2️⃣ Find the user
    const userResult = await pool.query(
      `SELECT id, name, email, phone, password_hash, is_active, deleted_at
       FROM admin_users
       WHERE email = $1
       LIMIT 1`,
      [email]
    );
    const dbUser = userResult.rows[0];
    console.log('DB user:', dbUser);

    if (!dbUser) throw new BusinessError('USER_INACTIVE', { traceId: req.traceId });
    if (dbUser.deleted_at !== null) throw new BusinessError('USER_INACTIVE', { traceId: req.traceId });
    if (!dbUser.is_active) throw new BusinessError('USER_INACTIVE', { traceId: req.traceId });

    // 3️⃣ Compare password
    const isMatch = await bcrypt.compare(password, dbUser.password_hash);
    console.log('Password match:', isMatch);
    if (!isMatch) throw new BusinessError('INVALID_CREDENTIALS', { traceId: req.traceId });

    // 4️⃣ Fetch the user's role (log ur.role_id and r.id)
    const roleDebug = await pool.query(
      `SELECT ur.role_id AS user_role_id, r.id AS role_id, r.name, r.is_active, r.deleted_at
       FROM admin_user_roles ur
       LEFT JOIN admin_roles r ON ur.role_id = r.id
       WHERE ur.admin_user_id = $1`,
      [dbUser.id]
    );
    console.log('All role links for user:', roleDebug.rows);

    const roleResult = await pool.query(
      `SELECT r.id, r.name, r.is_active, r.deleted_at
       FROM admin_roles r
       INNER JOIN admin_user_roles ur ON ur.role_id = r.id
       WHERE ur.admin_user_id = $1
       AND r.is_active = true
       AND r.deleted_at IS NULL
       LIMIT 1`,
      [dbUser.id]
    );
    console.log('Filtered active role result:', roleResult.rows);

    const role = roleResult.rows[0];
    if (!role) {
      throw new BusinessError('USER_INACTIVE', {
        traceId: req.traceId,
        details: { reason: 'No active role assigned' },
      });
    }

    // 5️⃣ Generate access token
    const userForToken = {
      userId: dbUser.id,
      name: dbUser.name,
      email: dbUser.email,
      mobileNumber: dbUser.phone,
      isActive: dbUser.is_active,
      role: role.name,
    };
    console.log('User payload for token:', userForToken);

    const accessToken = generateAccessToken(userForToken);
    console.log('Decoded Access Token:', decodeToken(accessToken));

    // 6️⃣ Send response
    return sendSuccess(
      res,
      'USER_LOGIN_SUCCESS',
      {
        accessToken,
        meta: { durationMs: Date.now() - startTime },
      },
      req.traceId
    );

  } catch (err) {
    console.error('Login error:', err);
    return next(err);
  }
};
