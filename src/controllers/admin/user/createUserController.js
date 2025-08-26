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
    const requestingUserId = req.user?.userId;
    console.log('[createUser] requestingUserId:', requestingUserId);

    const { name, email, mobileNumber, roleId } = req.body;
    console.log('[createUser] body:', req.body);

    // 1️⃣ Validate required fields
    const missingFields = validateRequiredFields(req.body, ['name', 'email', 'roleId']);
    if (missingFields.length > 0) {
      throw new BusinessError('MISSING_REQUIRED_FIELDS', {
        details: { fields: missingFields },
        traceId: req.traceId,
        retryable: true,
      });
    }

    // 1.5️⃣ Validate email
    if (!validateEmail(email)) {
      throw new BusinessError('INVALID_EMAIL_FORMAT', {
        details: { email },
        traceId: req.traceId,
        retryable: true,
      });
    }

    // 1.6️⃣ Validate phone
    if (mobileNumber && !validateMobileNumber(mobileNumber)) {
      throw new BusinessError('INVALID_MOBILE_NUMBER_FORMAT', {
        details: { mobileNumber },
        message: 'Invalid mobile number format. Use +92XXXXXXXXXX format',
        traceId: req.traceId,
        retryable: true,
      });
    }

    // 2️⃣ Permission check
    await hasAdminPermissions(requestingUserId, 'CREATE_USER');

    // 3️⃣ Role check
    const roleCheck = await pool.query('SELECT id FROM admin_roles WHERE id = $1', [roleId]);
    if (roleCheck.rowCount === 0) {
      throw new BusinessError('INVALID_ROLE', {
        message: 'The specified role does not exist',
        traceId: req.traceId,
      });
    }

    // 4️⃣ Check for duplicate email or phone
    let duplicateQuery = `SELECT id, email, phone 
                          FROM admin_users 
                          WHERE email = $1 OR (phone IS NOT NULL AND phone = $2)`;
    const duplicateCheck = await pool.query(duplicateQuery, [email, mobileNumber || null]);

    if (duplicateCheck.rowCount > 0) {
      const existingUser = duplicateCheck.rows[0];
      let conflictField = existingUser.email === email ? 'email' : 'phone';
      throw new BusinessError('USER_ALREADY_EXISTS', 
       
      );
    }

    // 5️⃣ Default password
    const defaultPassword = '12345678';
    const passwordHash = await bcrypt.hash(defaultPassword, 10);

    // 6️⃣ Insert user
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
      false
    ]);
    const dbUser = result.rows[0];

    // 7️⃣ Assign role
    await pool.query(
      `INSERT INTO admin_user_roles (admin_user_id, role_id) VALUES ($1, $2)`,
      [newUserId, roleId]
    );

    // 8️⃣ Response formatting
    const user = {
      id: dbUser.id,
      name: dbUser.name,
      email: dbUser.email,
      mobileNumber: dbUser.mobile_number,
      roleId: roleId,
      isActive: dbUser.is_active,
      createdAt: dbUser.created_at,
    };

    // 9️⃣ Success
    return sendSuccess(
      res,
      'USER_CREATED',
      { user, meta: { durationMs: Date.now() - startTime } },
      req.traceId
    );

  } catch (err) {
    console.error('[createUser] Error:', err);

    // 🔥 Handle DB unique constraint fallback
    if (err.code === '23505') {
      let conflictField = 'email/phone';
      if (err.detail?.includes('(email)')) conflictField = 'email';
      if (err.detail?.includes('(phone)')) conflictField = 'phone';

      return next(new BusinessError('USER_ALREADY_EXISTS', {
        message: `User with this ${conflictField} already exists`,
        details: { conflictField },
        traceId: req.traceId,
      }));
    }

    return next(err);
  }
};
