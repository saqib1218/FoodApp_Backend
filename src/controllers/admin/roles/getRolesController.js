const pool = require('../../../config/database');
const BusinessError = require('../../../lib/businessErrors');
const { sendSuccess } = require('../../../utils/responseHelpers');
const { hasAdminPermissions } = require('../../../services/hasAdminPermissions');
const PERMISSIONS = require('../../../config/permissions');

exports.getRoles = async (req, res, next) => {
  const startTime = Date.now();

  try {
    // ✅ Get user ID from authenticated request (token)
    const userId = req.user?.userId;

    // ✅ Check if user has permission to view roles
    await hasAdminPermissions(userId, PERMISSIONS.ADMIN.ROLE.LIST_VIEW);

    // 1️⃣ Extract filters
    const { name, isActive } = req.query;

    // 2️⃣ Build dynamic WHERE clauses
    const whereClauses = ['r.deleted_at IS NULL']; // exclude deleted roles
    const values = [];
    let idx = 1;

    if (name) {
      whereClauses.push(`r.name ILIKE $${idx++}`);
      values.push(`%${name}%`);
    }
    if (isActive !== undefined) {
      whereClauses.push(`r.is_active = $${idx++}`);
      values.push(isActive === 'true');
    }

    const whereSQL = 'WHERE ' + whereClauses.join(' AND ');

    // 3️⃣ Fetch roles (⚡ no pagination)
    const rolesQuery = `
      SELECT r.id, r.name, r.description, r.is_active, r.created_at, r.updated_at
      FROM admin_roles r
      ${whereSQL}
      ORDER BY r.created_at DESC
    `;
    const rolesRes = await pool.query(rolesQuery, values);

    // ✅ Convert role rows into camelCase
    const roles = rolesRes.rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      isActive: r.is_active,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));

    // 4️⃣ Fetch permissions for all roles at once
    if (roles.length > 0) {
      const roleIds = roles.map((r) => r.id);
      const permissionsQuery = `
        SELECT rp.role_id, p.id AS permission_id, p.key, p.name, p.description
        FROM admin_role_permissions rp
        JOIN admin_permissions p ON rp.permission_id = p.id
        WHERE rp.role_id = ANY($1)
      `;
      const permissionsRes = await pool.query(permissionsQuery, [roleIds]);

      const permissionMap = {};
      permissionsRes.rows.forEach((p) => {
        if (!permissionMap[p.role_id]) permissionMap[p.role_id] = [];
        permissionMap[p.role_id].push({
          id: p.permission_id,
          key: p.key,
          name: p.name,
          description: p.description,
        });
      });

      // ✅ Attach permissions in camelCase
      roles.forEach((r) => {
        r.permissions = permissionMap[r.id] || [];
      });
    }

    // 5️⃣ Send response (⚡ no pagination metadata)
    return sendSuccess(
      res,
      'ROLES_LIST_FETCHED',
      {
        roles,
        meta: {
          durationMs: Date.now() - startTime,
        },
      },
      req.traceId
    );
  } catch (err) {
    return next(err);
  }
};
