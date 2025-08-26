const pool = require('../../../config/database');
const { sendSuccess } = require('../../../utils/responseHelpers');
const { hasAdminPermissions } = require('../../../services/hasAdminPermissions');
const BusinessError = require('../../../lib/businessErrors');

exports.getUserById = async (req, res, next) => {
  const startTime = Date.now();

  try {
    const requestingUserId = req.user?.userId;
    const targetUserId = req.params.userId; // keep as string for UUID

    // Optional: validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(targetUserId)) {
      return next(new BusinessError('USER_NOT_FOUND'));
    }

    // 1️⃣ Permission check
    await hasAdminPermissions(requestingUserId, 'VIEW_USERS');

    // 2️⃣ Fetch user with roles
    const query = `
      SELECT 
        u.id,
        u.name,
        u.email,
        u.phone AS mobile_number,
        u.is_active,
        u.created_at,
        COALESCE(
          json_agg(
            json_build_object(
              'role_id', r.id,
              'role_name', r.name,
              'is_active', r.is_active
            )
          ) FILTER (WHERE r.id IS NOT NULL), '[]'
        ) AS roles
      FROM admin_users u
      LEFT JOIN admin_user_roles ur ON u.id = ur.admin_user_id
      LEFT JOIN admin_roles r ON ur.role_id = r.id
      WHERE u.id = $1
      GROUP BY u.id
    `;

    const { rows } = await pool.query(query, [targetUserId]);

    if (!rows.length) {
      return next(new BusinessError('USER_NOT_FOUND'));
    }

    // 3️⃣ Send response
    return sendSuccess(
      res,
      'USER_DETAILS_FETCHED',
      {
        user: rows[0],
        meta: { durationMs: Date.now() - startTime }
      },
      req.traceId
    );

  } catch (err) {
    return next(err);
  }
};
