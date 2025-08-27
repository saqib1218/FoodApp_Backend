const pool = require('../../../config/database');
const BusinessError = require('../../../lib/businessErrors');
const { sendSuccess } = require('../../../utils/responseHelpers');
const { hasAdminPermissions } = require('../../../services/hasAdminPermissions');
const { getPagination } = require('../../../utils/getPagination');

exports.getUsers = async (req, res, next) => {
  const startTime = Date.now();
  try {
    const requestingUserId = req.user?.userId;

    // 1️⃣ Permission check
    await hasAdminPermissions(requestingUserId, 'VIEW_USERS');

    // 2️⃣ Extract query params
    const {
      name,
      email,
      roleId,
      isActive,
      deleted, // true/false filter for deleted users
      page,
      limit,
      lastId
    } = req.query;

    // 3️⃣ Pagination / lazy-loading
    const paging = getPagination({ page, limit, lastId, defaultLimit: 20 });

    // 4️⃣ Build dynamic WHERE clauses
    const conditions = [];
    const values = [];
    let idx = 1;

    if (name) {
      conditions.push(`u.name ILIKE $${idx++}`);
      values.push(`%${name}%`);
    }
    if (email) {
      conditions.push(`u.email ILIKE $${idx++}`);
      values.push(`%${email}%`);
    }
    if (roleId) {
      conditions.push(`r.role_id = $${idx++}`);
      values.push(roleId);
    }
    if (isActive !== undefined) {
      conditions.push(`u.is_active = $${idx++}`);
      values.push(isActive === 'true');
    }
    if (deleted !== undefined) {
      if (deleted === 'true') conditions.push(`u.deleted_at IS NOT NULL`);
      else conditions.push(`u.deleted_at IS NULL`);
    }
    if (paging.type === 'lazy' && paging.lastId) {
      conditions.push(`u.id > $${idx++}`);
      values.push(paging.lastId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 5️⃣ Fetch users
    const usersQuery = `
      SELECT u.id, u.name, u.email, u.phone AS mobile_number, u.is_active, u.created_at, u.deleted_at,
             COALESCE(
               json_agg(
                 json_build_object(
                   'role_id', r.role_id,
                   'role_name', r.role_name
                 )
               ) FILTER (WHERE r.role_id IS NOT NULL), '[]'
             ) AS roles
      FROM admin_users u
      LEFT JOIN (
        SELECT ur.admin_user_id, ur.role_id, r.name AS role_name
        FROM admin_user_roles ur
        LEFT JOIN admin_roles r ON ur.role_id = r.id
      ) r ON u.id = r.admin_user_id
      ${whereClause}
      GROUP BY u.id
      ORDER BY u.created_at DESC
      LIMIT $${idx++} ${paging.type === 'pagination' ? `OFFSET $${idx++}` : ''}
    `;
    if (paging.type === 'pagination') {
      values.push(paging.limit, paging.offset);
    } else {
      values.push(paging.limit);
    }

    const usersRes = await pool.query(usersQuery, values);
    const users = usersRes.rows;

    // 6️⃣ Total count for pagination
    let total = null;
    if (paging.type === 'pagination') {
      const countQuery = `
        SELECT COUNT(*) AS total
        FROM admin_users u
        LEFT JOIN admin_user_roles r ON u.id = r.admin_user_id
        ${whereClause}
      `;
      const countRes = await pool.query(countQuery, values.slice(0, values.length - 2));
      total = parseInt(countRes.rows[0].total, 10);
    }

    // 7️⃣ Send response
    return sendSuccess(
      res,
      'USERS_LIST_FETCHED',
      {
        users,
        meta: {
          total,
          limit: paging.limit,
          offset: paging.type === 'pagination' ? paging.offset : undefined,
          lastId: paging.type === 'lazy' ? paging.lastId : undefined,
          durationMs: Date.now() - startTime
        }
      },
      req.traceId
    );

  } catch (err) {
    return next(err);
  }
};
