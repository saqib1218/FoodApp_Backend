const pool = require('../../../config/database');
const BusinessError = require('../../../lib/businessErrors');
const { sendSuccess } = require('../../../utils/responseHelpers');

exports.getRolesByUserId = async (req, res, next) => {
  const startTime = Date.now();

  try {
    const targetUserId = req.params.id; // param from route
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

    // 2️⃣ Fetch roles for target user
    const rolesQuery = `
      SELECT r.id, r.name, r.description, r.is_active, r.created_at, r.updated_at
      FROM admin_user_roles ur
      INNER JOIN admin_roles r ON ur.role_id = r.id
      ${whereSQL}
      GROUP BY r.id
      ORDER BY r.created_at DESC
    `;
    const rolesRes = await pool.query(rolesQuery, values);
    const roles = rolesRes.rows;

    if (!roles.length) {
      return next(new BusinessError('USER_NOT_FOUND'));
    }

    // 3️⃣ Fetch permissions for all roles at once
    const roleIds = roles.map(r => r.id);
    const permissionsQuery = `
      SELECT rp.role_id, p.id AS permission_id, p.key, p.name, p.description
      FROM admin_role_permissions rp
      JOIN admin_permissions p ON rp.permission_id = p.id
      WHERE rp.role_id = ANY($1)
    `;
    const permissionsRes = await pool.query(permissionsQuery, [roleIds]);

    // 4️⃣ Group permissions by role_id
    const permissionMap = {};
    permissionsRes.rows.forEach(p => {
      if (!permissionMap[p.role_id]) permissionMap[p.role_id] = [];
      permissionMap[p.role_id].push({
        id: p.permission_id,
        key: p.key,
        name: p.name,
        description: p.description
      });
    });

    // 5️⃣ Attach permissions to roles
    roles.forEach(r => {
      r.permissions = permissionMap[r.id] || [];
    });

    // 6️⃣ Send response
    return sendSuccess(
      res,
      'ROLES_FOR_USER_FETCHED',
      {
        roles,
        meta: { durationMs: Date.now() - startTime },
      },
      req.traceId
    );

  } catch (err) {
    return next(err);
  }
};
