const pool = require('../../../config/database');
const BusinessError = require('../../../lib/businessErrors');
const { sendSuccess } = require('../../../utils/responseHelpers');
const { hasAdminPermissions } = require('../../../services/hasAdminPermissions');
const { validateRequiredFields } = require('../../../utils/validation');

exports.createRole = async (req, res, next) => {
  const startTime = Date.now();
  try {
    const userId = req.user?.userId; // ✅ from validated access token
    const { name, description, isActive, permissionIds } = req.body;

    // 1️⃣ Validate required fields
    const missingFields = validateRequiredFields(req.body, ['name']);
    if (missingFields.length > 0) {
      throw new BusinessError('MISSING_REQUIRED_FIELDS', {
        details: { fields: missingFields },
        traceId: req.traceId,
        retryable: true,
      });
    }
    const existingRole = await pool.query('SELECT id FROM admin_roles WHERE name = $1', [name]);
if (existingRole.rows.length > 0) {
  throw new BusinessError('ROLE_ALREADY_EXISTS', {
    details: { name },
    traceId: req.traceId,
  });
}


    // 2️⃣ Check permission of requesting user
    await hasAdminPermissions(userId, 'admin.user.create');

    // 3️⃣ Insert new role with created_by
    const result = await pool.query(
      `INSERT INTO admin_roles (name, description, is_active, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, description, is_active, created_at, created_by`,
      [name, description || null, isActive !== undefined ? isActive : true, userId]
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
      createdBy: roleDb.created_by, // ✅ include createdBy in response
    };

    // 6️⃣ Send success response
    return sendSuccess(
      res,
      'ROLE_CREATED_SUCCESS',
      { role, meta: { durationMs: Date.now() - startTime } },
      req.traceId
    );

 
  } catch (err) {
  if (err.code === '23505') { // duplicate key
    return next(new BusinessError('ROLE_ALREADY_EXISTS', {
      details: { name: req.body.name },
      traceId: req.traceId,
    }));
  }
  return next(err);
}

};
