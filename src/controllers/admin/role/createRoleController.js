const pool = require('../../../config/database');
const BusinessError = require('../../../lib/businessErrors');
const { sendSuccess } = require('../../../utils/responseHelpers');
const { hasAdminPermissions } = require('../../../services/hasAdminPermissions');

exports.createRole = async (req, res, next) => {
  const startTime = Date.now();
  try {
    const userId = req.user?.userId; // from validated access token
    const { name, description, isActive, permissionIds } = req.body;

    // 1️⃣ Validate required fields
    if (!name) {
      throw new BusinessError('MISSING_REQUIRED_FIELDS', {
        details: { fields: ['name'] },
        traceId: req.traceId,
        retryable: true,
      });
    }

    // 2️⃣ Check permission of requesting user
    await hasAdminPermissions(userId, 'CREATE_ROLE');

    // 3️⃣ Insert new role
    const result = await pool.query(
      `INSERT INTO admin_roles (name, description, is_active)
       VALUES ($1, $2, $3)
       RETURNING id, name, description, is_active, created_at`,
      [name, description || null, isActive !== undefined ? isActive : true]
    );

    const roleDb = result.rows[0];

    // 4️⃣ Assign permissions if provided
    if (Array.isArray(permissionIds) && permissionIds.length > 0) {
      const insertValues = permissionIds.map((pid, index) => `($1, $${index + 2})`).join(', ');
      await pool.query(
        `INSERT INTO admin_role_permissions (role_id, permission_id) VALUES ${insertValues}`,
        [roleDb.id, ...permissionIds]
      );
    }

    // 5️⃣ Convert to camelCase for response
    const role = {
      id: roleDb.id,
      name: roleDb.name,
      description: roleDb.description,
      isActive: roleDb.is_active,
      permissionIds: permissionIds || [],
      createdAt: roleDb.created_at,
    };

    // 6️⃣ Send success response
    return sendSuccess(
      res,
      'ROLE_CREATED_SUCCESS',
      { role, meta: { durationMs: Date.now() - startTime } },
      req.traceId
    );

  } catch (err) {
    return next(err);
  }
};
