const pool = require('../../../config/database');
const BusinessError = require('../../../lib/businessErrors');
const { sendSuccess } = require('../../../utils/responseHelpers');
const { hasAdminPermissions } = require('../../../services/hasAdminPermissions');
const PERMISSIONS = require('../../../config/permissions');

exports.deletePermission = async (req, res, next) => {
  const startTime = Date.now();

  try {
    const requestingUserId = req.user?.userId; // Admin from token
    const permissionId = req.params.id;

    // ✅ Check admin permission
    await hasAdminPermissions(requestingUserId, PERMISSIONS.ADMIN.PERMISSION.DELETE);

    // ✅ Validate required field
    if (!permissionId) {
      throw new BusinessError('MISSING_REQUIRED_FIELDS', {
        details: { fields: ['id'] },
        traceId: req.traceId,
        retryable: true,
      });
    }

    // ✅ Start transaction
    await pool.query('BEGIN');

    // ✅ Soft delete the permission only if not already deleted
    const updateQuery = `
      UPDATE admin_permissions
      SET deleted_at = NOW(),
          updated_by = $2,
          updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id, key, name, description, deleted_at
    `;
    const result = await pool.query(updateQuery, [permissionId, requestingUserId]);

    if (!result.rows.length) {
      await pool.query('ROLLBACK');
      throw new BusinessError('PERMISSION_NOT_FOUND', {
        details: { id: permissionId },
        traceId: req.traceId,
      });
    }

    // ✅ Remove linked role permissions (hard delete)
    await pool.query(
      `DELETE FROM admin_role_permissions WHERE permission_id = $1`,
      [permissionId]
    );

    // ✅ Commit transaction
    await pool.query('COMMIT');

    // ✅ Send success response
    return sendSuccess(
      res,
      'PERMISSION_DELETED',
      {
        permission: result.rows[0],
        meta: { durationMs: Date.now() - startTime },
      },
      req.traceId
    );

  } catch (err) {
    try { await pool.query('ROLLBACK'); } catch (_) {}
    return next(err);
  }
};
