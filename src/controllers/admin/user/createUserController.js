const pool = require('../../../config/database');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const BusinessError = require('../../../lib/businessErrors');
const { sendSuccess } = require('../../../utils/responseHelpers');
const { hasAdminPermissions } = require('../../../services/hasAdminPermissions');
const { validateRequiredFields, validateEmail, validateMobileNumber } = require('../../../utils/validation');

exports.createUser = async (req, res, next) => {
  const startTime = Date.now();
  try {
    const requestingUserId = req.user?.userId; // token middleware must set req.user.userId
    console.log('[createUser] requestingUserId:', requestingUserId);

    const { name, email, mobileNumber, password, roleId, isActive } = req.body;
    console.log('[createUser] body:', req.body);

    // 1️⃣ Validate required fields using utility
    const missingFields = validateRequiredFields(req.body, ['name', 'email', 'password', 'roleId']);
    if (missingFields.length > 0) {
      console.log('[createUser] missingFields:', missingFields);
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

    // 1.6️⃣ Validate mobile number format if provided
    if (mobileNumber && !validateMobileNumber(mobileNumber)) {
      throw new BusinessError('INVALID_MOBILE_NUMBER_FORMAT', {
        details: { mobileNumber },
        message: 'Invalid mobile number format. Use +92XXXXXXXXXX format',
        traceId: req.traceId,
        retryable: true,
      });
    }

    // 2️⃣ Check if requesting user has permission
    console.log('[createUser] Checking CREATE_USER permission...');
    await hasAdminPermissions(requestingUserId, 'CREATE_USER');
    console.log('[createUser] Permission check passed');

    // 3️⃣ Check if role exists
    const roleCheck = await pool.query('SELECT id FROM admin_roles WHERE id = $1', [roleId]);
    if (roleCheck.rowCount === 0) {
      throw new BusinessError('INVALID_ROLE', {
        message: 'The specified role does not exist',
        traceId: req.traceId,
      });
    }

    // 4️⃣ Check if user already exists
    const userExists = await pool.query('SELECT id FROM admin_users WHERE email = $1', [email]);
    if (userExists.rowCount > 0) {
      throw new BusinessError('USER_ALREADY_EXISTS', {
        message: 'User with this email already exists',
        traceId: req.traceId,
      });
    }

    // 5️⃣ Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // 6️⃣ Insert new user
    const newUserId = uuidv4();
    const insertQuery = `
      INSERT INTO admin_users (id, name, email, phone, password_hash, is_active)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, name, email, phone AS mobile_number, is_active, created_at
    `;
    const result = await pool.query(insertQuery, [
      newUserId,
      name,
      email,
      mobileNumber || null,
      passwordHash,
      isActive !== undefined ? isActive : true, // default true if not provided
    ]);
    const dbUser = result.rows[0];

    // 7️⃣ Assign role in junction table
    await pool.query(
      `INSERT INTO admin_user_roles (admin_user_id, role_id)
       VALUES ($1, $2)`,
      [newUserId, roleId]
    );

    // 8️⃣ Convert to camelCase for response
    const user = {
      id: dbUser.id,
      name: dbUser.name,
      email: dbUser.email,
      mobileNumber: dbUser.mobile_number,
      roleId: roleId,
      isActive: dbUser.is_active,
      createdAt: dbUser.created_at,
    };

    // 9️⃣ Send success response
    return sendSuccess(
      res,
      'USER_CREATED',
      {
        user,
        meta: { durationMs: Date.now() - startTime },
      },
      req.traceId
    );

  } catch (err) {
    console.error('[createUser] Error:', err);
    return next(err);
  }
};
