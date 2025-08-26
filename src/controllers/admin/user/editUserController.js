const pool = require('../../../config/database');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const BusinessError = require('../../../lib/businessErrors');
const { sendSuccess } = require('../../../utils/responseHelpers');
const { hasAdminPermissions } = require('../../../services/hasAdminPermissions');
const { validateEmail, validateMobileNumber } = require('../../../utils/validation');
const { validateUserActionTime } = require('../../../services/validators/userActionValidator');

exports.editUser = async (req, res, next) => {
  const startTime = Date.now();
  try {
    const requestingUserId = req.user?.userId;
    const { id } = req.params; // user id from URL
    const { name, email, mobileNumber, password, roleId, isActive } = req.body;

    // 1️⃣ Validate required field: id
    if (!id) {
      throw new BusinessError('MISSING_REQUIRED_FIELDS', {
        details: { fields: ['id'] },
        traceId: req.traceId,
        retryable: true,
      });
    }

    // 2️⃣ Permission check
    await hasAdminPermissions(requestingUserId, 'EDIT_USER');

    // 3️⃣ Check if user exists
    const userCheck = await pool.query(
      `SELECT id, email FROM admin_users WHERE id = $1`,
      [id]
    );
    if (userCheck.rowCount === 0) {
      throw new BusinessError('USER_NOT_FOUND', { traceId: req.traceId });
    }

    // 4️⃣ Validate email if provided
    if (email && !validateEmail(email)) {
      throw new BusinessError('INVALID_EMAIL_FORMAT', {
        details: { email },
        traceId: req.traceId,
      });
    }

    // 5️⃣ Validate mobile number if provided
    if (mobileNumber && !validateMobileNumber(mobileNumber)) {
      throw new BusinessError('INVALID_MOBILE_NUMBER_FORMAT', {
        details: { mobileNumber },
        traceId: req.traceId,
      });
    }

    // 6️⃣ Check if role exists (only if provided)
    if (roleId) {
      const roleCheck = await pool.query(
        'SELECT id FROM admin_roles WHERE id = $1',
        [roleId]
      );
      if (roleCheck.rowCount === 0) {
        throw new BusinessError('INVALID_ROLE', { traceId: req.traceId });
      }
    }

    // 7️⃣ Prepare update fields
    const fieldsToUpdate = [];
    const values = [];
    let idx = 1;

    if (name !== undefined) {
      fieldsToUpdate.push(`name = $${idx++}`);
      values.push(name);
    }
    if (email !== undefined) {
      fieldsToUpdate.push(`email = $${idx++}`);
      values.push(email);
    }
    if (mobileNumber !== undefined) {
      fieldsToUpdate.push(`phone = $${idx++}`);
      values.push(mobileNumber);
    }
    if (password !== undefined) {
      const passwordHash = await bcrypt.hash(password, 10);
      fieldsToUpdate.push(`password_hash = $${idx++}`);
      values.push(passwordHash);
    }

    // ✅ Handle isActive separately
    if (isActive !== undefined) {
      if (typeof isActive !== 'boolean') {
        throw new BusinessError('INVALID_STATUS_FORMAT', {
          details: { fields: ['isActive'], value: isActive },
          traceId: req.traceId,
        });
      }

      try {
        await validateUserActionTime(id); // only allow status update if valid
        fieldsToUpdate.push(`is_active = $${idx++}`);
        values.push(isActive);
      } catch (err) {
        if (
          err instanceof BusinessError &&
          err.code === 'USER_ACTION_NOT_ALLOWED'
        ) {
          // ⚠️ Skip isActive update but allow other fields
          console.warn(`[editUser] Skipped isActive update for user ${id}: ${err.message}`);
        } else {
          throw err; // rethrow unexpected errors
        }
      }
    }

    // 8️⃣ Run update if any fields to update
    if (fieldsToUpdate.length > 0) {
      const updateQuery = `
        UPDATE admin_users
        SET ${fieldsToUpdate.join(', ')}
        WHERE id = $${idx}
        RETURNING id, name, email, phone AS mobile_number, is_active, created_at
      `;
      values.push(id);
      await pool.query(updateQuery, values);
    }

    // 9️⃣ Handle role replacement (user has one role at a time)
    if (roleId) {
      await pool.query(
        `DELETE FROM admin_user_roles WHERE admin_user_id = $1`,
        [id]
      );
      await pool.query(
        `INSERT INTO admin_user_roles (admin_user_id, role_id) VALUES ($1, $2)`,
        [id, roleId]
      );
    }

    // 🔟 Fetch updated user
    const updatedUserRes = await pool.query(
      `SELECT u.id, u.name, u.email, u.phone AS mobile_number, u.is_active, u.created_at, r.role_id
       FROM admin_users u
       LEFT JOIN admin_user_roles r ON u.id = r.admin_user_id
       WHERE u.id = $1`,
      [id]
    );

    const updatedUser = updatedUserRes.rows[0];

    // 1️⃣1️⃣ Send response
    return sendSuccess(
      res,
      'USER_UPDATED',
      {
        user: updatedUser,
        meta: { durationMs: Date.now() - startTime },
      },
      req.traceId
    );
  } catch (err) {
    return next(err);
  }
};
