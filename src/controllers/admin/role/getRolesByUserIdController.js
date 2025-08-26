const pool = require('../../../config/database');
const BusinessError = require('../../../lib/businessErrors');
const { sendSuccess } = require('../../../utils/responseHelpers');
const { hasAdminPermissions } = require('../../../services/hasAdminPermissions');

exports.getRolesByUserId = async (req, res, next) => {
  const startTime = Date.now();

  try {
    const requestingUserId = req.user?.userId;
    const targetUserId = req.params.userId; // 🔑 param from route

    // 1️⃣ Permission check
    await hasAdminPermissions(requestingUserId, 'VIEW_ROLES');

    // 2️⃣ Extract filters
    const { name, isActive } = req.query;

    // 3️⃣ Build dynamic WHERE clauses
    const whereClauses = ['ur.admin_user_id = $1']; // always filter by target user
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

    // 4️⃣ Fetch roles for target user (all roles, no pagination)
    const rolesQuery = `
      SELECT r.id, r.name, r.description, r.is_active, r.created_at, r.updated_at,
             json_agg(p.id) FILTER (WHERE p.id IS NOT NULL) AS permission_ids,
             json_agg(p.key) FILTER (WHERE p.key IS NOT NULL) AS permission_keys
      FROM admin_user_roles ur
      INNER JOIN admin_roles r ON ur.role_id = r.id
      LEFT JOIN admin_role_permissions rp ON r.id = rp.role_id
      LEFT JOIN admin_permissions p ON rp.permission_id = p.id
      ${whereSQL}
      GROUP BY r.id
      ORDER BY r.created_at DESC
    `;

    const rolesRes = await pool.query(rolesQuery, values);

    if (!rolesRes.rows.length) {
      return next(new BusinessError('USER_NOT_FOUND'));
    }

    // 5️⃣ Send response
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
