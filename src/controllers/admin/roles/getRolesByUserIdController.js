const pool = require('../../../config/database');
const BusinessError = require('../../../lib/businessErrors');
const { sendSuccess } = require('../../../utils/responseHelpers');

exports.getRolesByUserId = async (req, res, next) => {
  const startTime = Date.now();

  try {
    const targetUserId = req.params.userId; // param from route
    const { name, isActive } = req.query;

    // 1️⃣ Build dynamic WHERE clauses
    const whereClauses = ['ur.admin_user_id = $1', 'r.deleted_at IS NULL']; // exclude deleted roles
    const values = [targetUserId];
    let idx = 2;

    if (name) {
      whereClauses.push(`r.name ILIKE $${idx++}`);
      values.push(`%${name}%`);
    }
    if (isActive !== undefined) {
      whereClauses.push(`r.is_active = $${idx++}`);
      values.push(isActive === 'true');
    }

    const whereSQL = whereClauses.length ? 'WHERE ' + whereClauses.join(' AND ') : '';

    // 2️⃣ Fetch roles for target user (all roles, no permissions)
    const rolesQuery = `
      SELECT r.id, r.name, r.description, r.is_active, r.created_at, r.updated_at
      FROM admin_user_roles ur
      INNER JOIN admin_roles r ON ur.role_id = r.id
      ${whereSQL}
      GROUP BY r.id
      ORDER BY r.created_at DESC
    `;

    const rolesRes = await pool.query(rolesQuery, values);

    if (!rolesRes.rows.length) {
      return next(new BusinessError('USER_NOT_FOUND'));
    }

    // 3️⃣ Send response
    return sendSuccess(
      res,
      'ROLES_FOR_USER_FETCHED',
      {
        roles: rolesRes.rows,
        meta: { durationMs: Date.now() - startTime },
      },
      req.traceId
    );

  } catch (err) {
    return next(err);
  }
};
