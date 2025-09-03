const pool = require('../../../config/database');
const { sendSuccess } = require('../../../utils/responseHelpers');
const BusinessError = require('../../../lib/businessErrors');

exports.getUserById = async (req, res, next) => {
  const startTime = Date.now();

  try {
    const targetUserId = req.params.id;

    // ✅ Validate UUID format
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(targetUserId)) {
      return next(new BusinessError('ADMIN.USER_NOT_FOUND'));
    }

    const query = `
      SELECT 
        u.id,
        u.name,
        u.email,
        u.phone AS mobile_number,
        u.is_active,
        u.created_at,
        u.deleted_at,
        COALESCE(
          json_agg(
            json_build_object(
              'role_id', r.id,
              'role_name', r.name,
              'is_active', r.is_active,
              'deleted_at', r.deleted_at
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
      return next(new BusinessError('ADMIN.USER_NOT_FOUND'));
    }

    // ✅ Convert snake_case → camelCase
    const dbUser = rows[0];
    const user = {
      id: dbUser.id,
      name: dbUser.name,
      email: dbUser.email,
      mobileNumber: dbUser.mobile_number,
      isActive: dbUser.is_active,
      createdAt: dbUser.created_at,
      deletedAt: dbUser.deleted_at,
      roles: dbUser.roles.map(r => ({
        roleId: r.role_id,
        roleName: r.role_name,
        isActive: r.is_active,
        deletedAt: r.deleted_at
      }))
    };

    // ✅ Send response
    return sendSuccess(
      res,
      'ADMIN.USER_DETAILS_FETCHED',
      {
        user,
        meta: { durationMs: Date.now() - startTime }
      },
      req.traceId
    );

  } catch (err) {
    return next(err);
  }
};
