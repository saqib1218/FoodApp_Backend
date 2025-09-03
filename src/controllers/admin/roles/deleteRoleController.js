const pool = require('../../../config/database');
const BusinessError = require('../../../lib/businessErrors');
const { sendSuccess } = require('../../../utils/responseHelpers');
const { hasAdminPermissions } = require('../../../services/hasAdminPermissions');
const PERMISSIONS = require('../../../config/permissions'); 

exports.deleteRole = async (req, res, next) => {
  const startTime = Date.now();
  try {
    const requestingUserId = req.user?.userId;
    const { id } = req.params; // role id

    // 1️⃣ Permission check
    await hasAdminPermissions(requestingUserId, PERMISSIONS.ADMIN.ROLE.DELETE);

    // 2️⃣ Validate required field: id
    if (!id) {
      throw new BusinessError('COMMON.MISSING_REQUIRED_FIELDS', {
        details: { fields: ['id'] },
        traceId: req.traceId,
        retryable: true,
      });
    }

    // 3️⃣ Check if role exists and is not deleted
    const roleCheck = await pool.query(
      'SELECT id, is_active, deleted_at FROM admin_roles WHERE id = $1',
      [id]
    );

    if (roleCheck.rowCount === 0) {
      throw new BusinessError('ADMIN.ROLE_NOT_FOUND', { traceId: req.traceId });
    }

    const role = roleCheck.rows[0];

    if (role.deleted_at) {
      // Already deleted
      throw new BusinessError('ADMIN.ROLE_NOT_FOUND', { traceId: req.traceId });
    }

    // 4️⃣ Soft delete role (mark deleted_at and optionally deactivate)
    await pool.query(
      `UPDATE admin_roles
       SET is_active = false,
           deleted_at = NOW()
       WHERE id = $1`,
      [id]
    );

    // 5️⃣ Remove role assignments from users
    await pool.query(
      `DELETE FROM admin_user_roles WHERE role_id = $1`,
      [id]
    );

    // 6️⃣ Send response
    return sendSuccess(
      res,
      'ADMIN.ROLE_DELETED',
      { roleId: id, meta: { durationMs: Date.now() - startTime } },
      req.traceId
    );

  } catch (err) {
    return next(err);
  }
};
