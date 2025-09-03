const pool = require('../../../config/database');
const BusinessError = require('../../../lib/businessErrors');
const { sendSuccess } = require('../../../utils/responseHelpers');
const { hasAdminPermissions } = require('../../../services/hasAdminPermissions');
const PERMISSIONS = require('../../../config/permissions'); 

exports.getUsers = async (req, res, next) => {
  const startTime = Date.now();
  try {
    const requestingUserId = req.user?.userId;

    // 1️⃣ Permission check
    await hasAdminPermissions(requestingUserId, PERMISSIONS.ADMIN.USER.LIST_VIEW);

    // 2️⃣ Extract query params
    const {
      name,
      email,
      roleId,
      isActive,
      deleted // true/false filter for deleted users
    } = req.query;

    // 3️⃣ Build dynamic WHERE clauses
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

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 4️⃣ Fetch users
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
    `;

    const usersRes = await pool.query(usersQuery, values);

    // 5️⃣ Map snake_case → camelCase
    const users = usersRes.rows.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      mobileNumber: u.mobile_number,
      isActive: u.is_active,
      createdAt: u.created_at,
      deletedAt: u.deleted_at,
      roles: u.roles.map(r => ({
        roleId: r.role_id,
        roleName: r.role_name
      }))
    }));

    // 6️⃣ Send response
    return sendSuccess(
      res,
      'ADMIN.USERS_LIST_FETCHED',
      {
        users,
        meta: { durationMs: Date.now() - startTime }
      },
      req.traceId
    );

  } catch (err) {
    return next(err);
  }
};
