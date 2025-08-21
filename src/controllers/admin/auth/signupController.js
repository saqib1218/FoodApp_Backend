const pool = require('../../../config/database');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const BusinessError = require('../../../lib/businessErrors');
const { sendSuccess } = require('../../../utils/responseHelpers');

exports.createSuperAdmin = async (req, res, next) => {
  const startTime = Date.now();
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      throw new BusinessError('MISSING_REQUIRED_FIELDS', {
        details: { fields: ['name', 'email', 'password'] },
        traceId: req.traceId,
        retryable: true,
      });
    }

    // 1️⃣ Check if user already exists
    const userCheck = await pool.query(
      'SELECT id FROM admin_users WHERE email=$1 AND deleted_at IS NULL LIMIT 1',
      [email]
    );
    if (userCheck.rows.length > 0) {
      throw new BusinessError('USER_ALREADY_EXISTS', {
        traceId: req.traceId,
        details: { email },
      });
    }

    // 2️⃣ Ensure superadmin role exists
    const roleResult = await pool.query(
      `INSERT INTO admin_roles (name, description) 
       VALUES ('superadmin', 'Top-level admin with all permissions')
       ON CONFLICT (name) DO NOTHING
       RETURNING id`
    );

    let roleId;
    if (roleResult.rows.length > 0) {
      roleId = roleResult.rows[0].id;
    } else {
      // fetch existing superadmin role
      const existingRole = await pool.query(
        "SELECT id FROM admin_roles WHERE name='superadmin' LIMIT 1"
      );
      roleId = existingRole.rows[0].id;
    }

    // 3️⃣ Hash password
    const password_hash = await bcrypt.hash(password, 10);

    // 4️⃣ Create superadmin user
    const userId = uuidv4();
    await pool.query(
      `INSERT INTO admin_users (id, name, email, password_hash) 
       VALUES ($1, $2, $3, $4)`,
      [userId, name, email, password_hash]
    );

    // 5️⃣ Assign role
    await pool.query(
      `INSERT INTO admin_user_roles (admin_user_id, role_id) 
       VALUES ($1, $2)`,
      [userId, roleId]
    );

    return sendSuccess(res, 'USER_CREATED', {
      user: { id: userId, name, email, role: 'superadmin' },
      meta: { duration_ms: Date.now() - startTime },
    }, req.traceId);

  } catch (err) {
    return next(err);
  }
};
