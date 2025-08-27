const pool = require('../../../config/database');
const BusinessError = require('../../../lib/businessErrors');
const { sendSuccess } = require('../../../utils/responseHelpers');
const { hasAdminPermissions } = require('../../../services/hasAdminPermissions');

exports.editRole = async (req, res, next) => {
  const startTime = Date.now();

  try {
    const userId = req.user?.userId;
    const { id } = req.params; // role ID
    const { name, description, isActive, permissionIds } = req.body;

    if (!id) {
      throw new BusinessError('MISSING_REQUIRED_FIELDS', { details: { fields: ['id'] }, traceId: req.traceId });
    }
    if (!name || !Array.isArray(permissionIds)) {
      throw new BusinessError('MISSING_REQUIRED_FIELDS', { details: { fields: ['name', 'permissionIds'] }, traceId: req.traceId });
    }

    // Check permission of requesting user
    await hasAdminPermissions(userId, 'EDIT_ROLE');

    // Begin transaction
    await pool.query('BEGIN');

    // Ensure role exists
    const roleCheck = await pool.query('SELECT id FROM admin_roles WHERE id = $1', [id]);
    if (roleCheck.rowCount === 0) {
      throw new BusinessError('INVALID_ROLE', { traceId: req.traceId });
    }

    // Update role fields
    const updateRole = await pool.query(
      `UPDATE admin_roles
       SET name = $1, description = $2, is_active = $3,
           updated_at = NOW(), updated_by = $4
       WHERE id = $5
       RETURNING id, name, description, is_active, created_at, updated_at`,
      [name, description || null, isActive !== undefined ? isActive : true, userId, id]
    );
    const updatedRole = updateRole.rows[0];

    // Replace permissions
    await pool.query('DELETE FROM admin_role_permissions WHERE role_id = $1', [id]);

    if (permissionIds.length > 0) {
      const values = permissionIds.map((pid, i) => `($1, $${i + 2})`).join(', ');
      await pool.query(
        `INSERT INTO admin_role_permissions (role_id, permission_id) VALUES ${values}`,
        [id, ...permissionIds]
      );
    }

    await pool.query('COMMIT');

    // Fetch full permission details
    let permissions = [];
    if (permissionIds.length > 0) {
      const permQuery = `
        SELECT id, key, name, description
        FROM admin_permissions
        WHERE id = ANY($1)
      `;
      const permRes = await pool.query(permQuery, [permissionIds]);
      permissions = permRes.rows;
    }

    // Send response
    const role = {
      id: updatedRole.id,
      name: updatedRole.name,
      description: updatedRole.description,
      isActive: updatedRole.is_active,
      permissions,          // full permission objects
      createdAt: updatedRole.created_at,
      updatedAt: updatedRole.updated_at,
    };

    return sendSuccess(
      res,
      'ROLE_UPDATED',
      { role, meta: { durationMs: Date.now() - startTime } },
      req.traceId
    );

  } catch (err) {
    await pool.query('ROLLBACK');
    return next(err);
  }
};
