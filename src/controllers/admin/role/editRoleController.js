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

    console.log('👉 Incoming editRole request:', {
      traceId: req.traceId,
      userId,
      roleId: id,
      body: req.body
    });

    if (!id) {
      console.error('❌ Missing role ID');
      throw new BusinessError('MISSING_REQUIRED_FIELDS', {
        details: { fields: ['id'] },
        traceId: req.traceId,
      });
    }

    if (!name || !Array.isArray(permissionIds)) {
      console.error('❌ Missing required fields for role update', { name, permissionIds });
      throw new BusinessError('MISSING_REQUIRED_FIELDS', {
        details: { fields: ['name', 'permissionIds'] },
        traceId: req.traceId,
      });
    }

    // Check permission of requesting user
    console.log('🔐 Checking admin permission for user:', userId);
    await hasAdminPermissions(userId, 'EDIT_ROLE');

    // Begin transaction
    await pool.query('BEGIN');
    console.log('🟢 Transaction started');

    // Ensure role exists
    const roleCheck = await pool.query(
      'SELECT id FROM admin_roles WHERE id = $1',
      [id]
    );
    if (roleCheck.rowCount === 0) {
      console.warn('⚠️ Role not found:', id);
      throw new BusinessError('INVALID_ROLE', { traceId: req.traceId });
    }

    // Update role fields
    console.log('✏️ Updating role fields...');
    const updateRole = await pool.query(
      `UPDATE admin_roles
       SET name = $1, description = $2, is_active = $3,
           updated_at = NOW(), updated_by = $4
       WHERE id = $5
       RETURNING id, name, description, is_active, created_at, updated_at`,
      [name, description || null, isActive !== undefined ? isActive : true, userId, id]
    );

    const updatedRole = updateRole.rows[0];
    console.log('✅ Role updated:', updatedRole);

    // Replace permissions
    console.log('♻️ Replacing permissions for role:', id);
    await pool.query('DELETE FROM admin_role_permissions WHERE role_id = $1', [id]);

    if (permissionIds.length > 0) {
      console.log('➕ Inserting permissions:', permissionIds);
      const values = permissionIds.map((pid, i) => `($1, $${i + 2})`).join(', ');
      await pool.query(
        `INSERT INTO admin_role_permissions (role_id, permission_id) VALUES ${values}`,
        [id, ...permissionIds]
      );
    } else {
      console.log('ℹ️ No permissions provided, role will have none.');
    }

    await pool.query('COMMIT');
    console.log('✅ Transaction committed');

    const role = {
      id: updatedRole.id,
      name: updatedRole.name,
      description: updatedRole.description,
      isActive: updatedRole.is_active,
      permissionIds,
      createdAt: updatedRole.created_at,
      updatedAt: updatedRole.updated_at,
    };

    console.log('📤 Sending success response:', role);

    return sendSuccess(
      res,
      'ROLE_UPDATED',
      { role, meta: { durationMs: Date.now() - startTime } },
      req.traceId
    );
  } catch (err) {
    await pool.query('ROLLBACK');
    console.error('⛔ Error in editRole, rolled back transaction:', err);
    return next(err);
  }
};
