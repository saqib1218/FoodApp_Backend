const pool = require('../../../config/database');
const BusinessError = require('../../../lib/businessErrors');
const { sendSuccess } = require('../../../utils/responseHelpers');
const { getPagination } = require('../../../utils/getPagination');

exports.getRoles = async (req, res, next) => {
  const startTime = Date.now();
  try {
    // 1️⃣ Extract filters & pagination/lazy loading
    const { name, isActive, page, limit, lastId } = req.query;
    const paging = getPagination({ page, limit, lastId, defaultLimit: 20 });

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
    if (paging.type === 'lazy' && paging.lastId) {
      whereClauses.push(`r.id > $${idx++}`);
      values.push(paging.lastId);
    }

    const whereSQL = 'WHERE ' + whereClauses.join(' AND ');

    // 3️⃣ Fetch roles
    const rolesQuery = `
      SELECT r.id, r.name, r.description, r.is_active, r.created_at, r.updated_at
      FROM admin_roles r
      ${whereSQL}
      ORDER BY r.created_at DESC
      LIMIT $${idx++} ${paging.type === 'pagination' ? `OFFSET $${idx++}` : ''}
    `;
    if (paging.type === 'pagination') {
      values.push(paging.limit, paging.offset);
    } else {
      values.push(paging.limit);
    }

    const rolesRes = await pool.query(rolesQuery, values);
    const roles = rolesRes.rows;

    // 4️⃣ Fetch permissions for all roles at once
    if (roles.length > 0) {
      const roleIds = roles.map(r => r.id);
      const permissionsQuery = `
        SELECT rp.role_id, p.id AS permission_id, p.key, p.name, p.description
        FROM admin_role_permissions rp
        JOIN admin_permissions p ON rp.permission_id = p.id
        WHERE rp.role_id = ANY($1)
      `;
      const permissionsRes = await pool.query(permissionsQuery, [roleIds]);

      // Group permissions by role_id
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

      // Attach permissions to roles
      roles.forEach(r => {
        r.permissions = permissionMap[r.id] || [];
      });
    }

    // 5️⃣ Total count for pagination only
    let total = null;
    if (paging.type === 'pagination') {
      const countQuery = `SELECT COUNT(*) AS total FROM admin_roles r ${whereSQL}`;
      const countRes = await pool.query(
        countQuery,
        values.slice(0, values.length - (paging.type === 'pagination' ? 2 : 1))
      );
      total = parseInt(countRes.rows[0].total, 10);
    }

    // 6️⃣ Send response
    return sendSuccess(
      res,
      'ROLES_LIST_FETCHED',
      {
        roles,
        meta: {
          total,
          limit: paging.limit,
          page: paging.type === 'pagination' ? parseInt(page) : undefined,
          lastId: paging.type === 'lazy' ? paging.lastId : undefined,
          durationMs: Date.now() - startTime,
        },
      },
      req.traceId
    );

  } catch (err) {
    return next(err);
  }
};
