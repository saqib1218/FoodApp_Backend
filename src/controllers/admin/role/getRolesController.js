const pool = require('../../../config/database');
const BusinessError = require('../../../lib/businessErrors');
const { sendSuccess } = require('../../../utils/responseHelpers');
const { hasAdminPermissions } = require('../../../services/hasAdminPermissions');
const { getPagination } = require('../../../utils/getPagination'); // <-- import util

exports.getRoles = async (req, res, next) => {
  const startTime = Date.now();
  try {
    const requestingUserId = req.user?.userId;

    // 1️⃣ Permission check
    await hasAdminPermissions(requestingUserId, 'VIEW_ROLES');

    // 2️⃣ Extract filters & pagination/lazy loading
    const { name, isActive, page, limit, lastId } = req.query;
    const paging = getPagination({ page, limit, lastId, defaultLimit: 20 });

    // 3️⃣ Build dynamic WHERE clauses
    const whereClauses = [];
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

    const whereSQL = whereClauses.length ? 'WHERE ' + whereClauses.join(' AND ') : '';

    // 4️⃣ Fetch roles
    const rolesQuery = `
      SELECT r.id, r.name, r.description, r.is_active, r.created_at, r.updated_at,
             json_agg(p.id) FILTER (WHERE p.id IS NOT NULL) AS permission_ids,
             json_agg(p.key) FILTER (WHERE p.key IS NOT NULL) AS permission_keys
      FROM admin_roles r
      LEFT JOIN admin_role_permissions rp ON r.id = rp.role_id
      LEFT JOIN admin_permissions p ON rp.permission_id = p.id
      ${whereSQL}
      GROUP BY r.id
      ORDER BY r.created_at DESC
      LIMIT $${idx++} ${paging.type === 'pagination' ? `OFFSET $${idx++}` : ''}
    `;
    if (paging.type === 'pagination') {
      values.push(paging.limit, paging.offset);
    } else {
      values.push(paging.limit);
    }

    const rolesRes = await pool.query(rolesQuery, values);

    // 5️⃣ Total count for pagination only
    let total = null;
    if (paging.type === 'pagination') {
      const countQuery = `SELECT COUNT(*) AS total FROM admin_roles r ${whereSQL}`;
      const countRes = await pool.query(countQuery, values.slice(0, values.length - (paging.type === 'pagination' ? 2 : 1)));
      total = parseInt(countRes.rows[0].total, 10);
    }

    // 6️⃣ Send response
    return sendSuccess(
      res,
      'ROLES_LIST_FETCHED',
      {
        roles: rolesRes.rows,
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
