const pool = require('../../../config/database');
const BusinessError = require('../../../lib/businessErrors');
const { sendSuccess } = require('../../../utils/responseHelpers');
const { hasAdminPermissions } = require('../../../services/hasAdminPermissions');
const PERMISSIONS = require('../../../config/permissions');

exports.deletePermission = async (req, res, next) => {
  const startTime = Date.now();

  const client = await pool.connect(); // use a client for transaction
  try {
    const requestingUserId = req.user?.userId; // from access token
    const permissionId = req.params.id; // permission ID from route

    if (!permissionId) {
      throw new BusinessError('MISSING_REQUIRED_FIELDS', {
        details: { fields: ['id'] },
        traceId: req.traceId,
        retryable: true,
      });
    }

    // 1️⃣ Check permission of the requesting user
    await hasAdminPermissions(requestingUserId, PERMISSIONS.ADMIN.PERMISSION.DELETE);

    await client.query('BEGIN'); // start transaction

    // 2️⃣ Soft delete the permission
    const updateQuery = `
      UPDATE admin_permissions
      SET deleted_at = NOW(),
          updated_by = $2,
          updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id, key, name, description, deleted_at
    `;
    const result = await client.query(updateQuery, [permissionId, requestingUserId]);

    if (!result.rows.length) {
      throw new BusinessError('PERMISSION_NOT_FOUND', {
        details: { id: permissionId },
        traceId: req.traceId,
      });
    }

    // 3️⃣ Remove linked role permissions (optional, keeps DB consistent)
    await client.query(
      `DELETE FROM admin_role_permissions WHERE permission_id = $1`,
      [permissionId]
    );

    await client.query('COMMIT'); // commit transaction

    // 4️⃣ Send success response
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
    await client.query('ROLLBACK'); // rollback on error
    return next(err);
  } finally {
    client.release();
  }
};
