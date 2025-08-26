const pool = require('../../../config/database');
const BusinessError = require('../../../lib/businessErrors');
const { sendSuccess } = require('../../../utils/responseHelpers');
const { hasAdminPermissions } = require('../../../services/hasAdminPermissions');

exports.deleteRole = async (req, res, next) => {
  const startTime = Date.now();
  try {
    const requestingUserId = req.user?.userId;
    const { id } = req.params; // role id

    // 1️⃣ Validate required field: id
    if (!id) {
      throw new BusinessError('MISSING_REQUIRED_FIELDS', {
        details: { fields: ['id'] },
        traceId: req.traceId,
        retryable: true,
      });
    }

    // 2️⃣ Permission check
    await hasAdminPermissions(requestingUserId, 'DELETE_ROLE');

    // 3️⃣ Check if role exists and is active
    const roleCheck = await pool.query(
      'SELECT id, is_active FROM admin_roles WHERE id = $1',
      [id]
    );

    if (roleCheck.rowCount === 0) {
      throw new BusinessError('ROLE_NOT_FOUND', { traceId: req.traceId });
    }

    const role = roleCheck.rows[0];

    if (!role.is_active) {
      throw new BusinessError('ROLE_ALREADY_INACTIVE', { traceId: req.traceId });
    }

    // 4️⃣ Soft delete role by marking inactive and setting deleted_at
    await pool.query(
      `UPDATE admin_roles
       SET is_active = false,
           deleted_at = NOW()
       WHERE id = $1`,
      [id]
    );

    // 5️⃣ Optionally, remove role assignments from users
    await pool.query(
      `DELETE FROM admin_user_roles WHERE role_id = $1`,
      [id]
    );

    // 6️⃣ Send response
    return sendSuccess(
      res,
      'ROLE_DELETED',
      { roleId: id, meta: { durationMs: Date.now() - startTime } },
      req.traceId
    );

  } catch (err) {
    return next(err);
  }
};
