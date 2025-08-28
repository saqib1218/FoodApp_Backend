const pool = require('../../../config/database');
const BusinessError = require('../../../lib/businessErrors');
const { sendSuccess } = require('../../../utils/responseHelpers');
const { hasAdminPermissions } = require('../../../services/hasAdminPermissions');
const PERMISSIONS = require('../../../config/permissions');

exports.deleteUser = async (req, res, next) => {
  const startTime = Date.now();
  try {

    const requestingUserId = req.user?.userId;
    const { id } = req.params; // user id to delete
    await hasAdminPermissions(requestingUserId, PERMISSIONS.ADMIN.USER.DELETE);

    // 1️⃣ Validate required field: id
    if (!id) {
      throw new BusinessError('MISSING_REQUIRED_FIELDS', {
        details: { fields: ['id'] },
        traceId: req.traceId,
        retryable: true,
      });
    }


    // 3️⃣ Check if user exists
    const userRes = await pool.query(
      `SELECT id, is_active FROM admin_users WHERE id = $1`,
      [id]
    );
    if (userRes.rowCount === 0) {
      throw new BusinessError('USER_NOT_FOUND', { traceId: req.traceId });
    }
    const user = userRes.rows[0];

    // 4️⃣ Soft delete logic
    const updateFields = [];
    const values = [];
    let idx = 1;

    // If user is active, first set is_active = false
    if (user.is_active) {
      updateFields.push(`is_active = $${idx++}`);
      values.push(false);
    }

    // Then set deleted_at = NOW()
    updateFields.push(`deleted_at = NOW()`);

    const updateQuery = `
      UPDATE admin_users
      SET ${updateFields.join(', ')}
      WHERE id = $${idx}
      RETURNING id, name, email, phone AS mobile_number, is_active, deleted_at, created_at
    `;
    values.push(id);
    const deletedUserRes = await pool.query(updateQuery, values);
    const deletedUser = deletedUserRes.rows[0];

    // 5️⃣ Remove user roles (optional, can soft-delete or keep history)
    await pool.query(
      `DELETE FROM admin_user_roles WHERE admin_user_id = $1`,
      [id]
    );

    // 6️⃣ Send response
    return sendSuccess(
      res,
      'USER_SOFT_DELETED',
      {
        user: deletedUser,
        meta: { durationMs: Date.now() - startTime },
      },
      req.traceId
    );

  } catch (err) {
    return next(err);
  }
};
