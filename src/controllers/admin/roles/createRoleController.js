const pool = require('../../../config/database');
const BusinessError = require('../../../lib/businessErrors');
const { sendSuccess } = require('../../../utils/responseHelpers');
const { hasAdminPermissions } = require('../../../services/hasAdminPermissions');
const { validateRequiredFields } = require('../../../utils/validation');
const PERMISSIONS = require('../../../config/permissions'); 

exports.createRole = async (req, res, next) => {
  const startTime = Date.now();
  try {
    const userId = req.user?.userId; // ✅ from validated access token
    const { name, description, isActive, permissionIds } = req.body;

    // 1️⃣ Validate ALL required fields
    const missingFields = validateRequiredFields(req.body, [
      'name',
     
      'isActive',
      'permissionIds'
    ]);

    if (missingFields.length > 0) {
      throw new BusinessError('MISSING_REQUIRED_FIELDS', {
        details: { fields: missingFields },
        traceId: req.traceId,
        retryable: true,
      });
    }

    // Extra validation: permissionIds must be a non-empty array
    if (!Array.isArray(permissionIds) || permissionIds.length === 0) {
      throw new BusinessError('INVALID_FIELD_VALUE', {
        details: { field: 'permissionIds', message: 'Must be a non-empty array' },
        traceId: req.traceId,
      });
    }

    // 2️⃣ Check if role exists (active or soft-deleted)
    const { rows: existingRoles } = await pool.query(
      'SELECT id, deleted_at FROM admin_roles WHERE name = $1',
      [name]
    );

    let roleDb;

    if (existingRoles.length > 0) {
      const existingRole = existingRoles[0];

      if (existingRole.deleted_at) {
        // ♻️ Reactivate the deleted role
        const { rows } = await pool.query(
          `UPDATE admin_roles
           SET description = $1,
               is_active = $2,
               deleted_at = NULL,
               updated_at = NOW(),
               updated_by = $3
           WHERE id = $4
           RETURNING id, name, description, is_active, created_at, created_by`,
          [description, isActive, userId, existingRole.id]
        );
        roleDb = rows[0];
      } else {
        // ❌ Role already active
        throw new BusinessError('ROLE_ALREADY_EXISTS', {
          details: { name },
          traceId: req.traceId,
        });
      }
    } else {
      // ✅ Create a new role
      await hasAdminPermissions(userId, PERMISSIONS.ADMIN.ROLE.CREATE);

      const { rows } = await pool.query(
        `INSERT INTO admin_roles (name, description, is_active, created_by)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, description, is_active, created_at, created_by`,
        [name, description, isActive, userId]
      );
      roleDb = rows[0];
    }

    // 3️⃣ Assign permissions (mandatory so no optional check here)
    const insertValues = permissionIds.map((pid, index) => `($1, $${index + 2})`).join(', ');
    await pool.query(
      `INSERT INTO admin_role_permissions (role_id, permission_id) 
       VALUES ${insertValues}
       ON CONFLICT (role_id, permission_id) DO NOTHING`,
      [roleDb.id, ...permissionIds]
    );

    // 4️⃣ Convert to camelCase for response
    const role = {
      id: roleDb.id,
      name: roleDb.name,
      description: roleDb.description,
      isActive: roleDb.is_active,
      permissionIds,
      createdAt: roleDb.created_at,
      createdBy: roleDb.created_by,
    };

    // 5️⃣ Send success response
    return sendSuccess(
      res,
      'ROLE_CREATED_SUCCESS',
      { role, meta: { durationMs: Date.now() - startTime } },
      req.traceId
    );

  } catch (err) {
    if (err.code === '23505') {
      return next(new BusinessError('ROLE_ALREADY_EXISTS', {
        details: { name: req.body.name },
        traceId: req.traceId,
      }));
    }
    return next(err);
  }
};
