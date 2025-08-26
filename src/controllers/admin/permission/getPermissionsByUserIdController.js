const pool = require('../../../config/database');
const BusinessError = require('../../../lib/businessErrors');
const { sendSuccess } = require('../../../utils/responseHelpers');
const { hasAdminPermissions } = require('../../../services/hasAdminPermissions');

exports.getPermissionsByUserId = async (req, res, next) => {
  const startTime = Date.now();

  try {
    const requestingUserId = req.user?.userId;
    const targetUserId = req.params.userId; // param from route

    // 1️⃣ Permission check
    await hasAdminPermissions(requestingUserId, 'VIEW_PERMISSION');

    // 2️⃣ Extract search filter
    const { search } = req.query;

    // 3️⃣ Build WHERE clause
    const conditions = ['ur.admin_user_id = $1'];
    const values = [targetUserId];
    let idx = 2;

    if (search) {
      conditions.push(`(p.key ILIKE $${idx} OR p.name ILIKE $${idx})`);
      values.push(`%${search}%`);
      idx++;
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    // 4️⃣ Fetch all permissions for the user
    const query = `
      SELECT DISTINCT p.id, p.key, p.name, p.description, 
                      p.created_by, p.created_at, p.updated_by, p.updated_at
      FROM admin_user_roles ur
      INNER JOIN admin_roles r ON ur.role_id = r.id
      INNER JOIN admin_role_permissions rp ON r.id = rp.role_id
      INNER JOIN admin_permissions p ON rp.permission_id = p.id
      ${whereClause}
      ORDER BY p.created_at DESC
    `;

    const result = await pool.query(query, values);
    const permissions = result.rows;

    // 5️⃣ Handle case when no permissions found
    if (!permissions || permissions.length === 0) {
      throw new BusinessError('PERMISSION_NOT_FOUND');
    }

    // 6️⃣ Send response
    return sendSuccess(
      res,
      'PERMISSIONS_FOR_USER_FETCHED',
      {
        permissions,
        meta: { durationMs: Date.now() - startTime },
      },
      req.traceId
    );

  } catch (err) {
    return next(err);
  }
};
