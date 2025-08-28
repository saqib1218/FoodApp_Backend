const pool = require('../../../config/database');
const bcrypt = require('bcryptjs');
const BusinessError = require('../../../lib/businessErrors');
const { sendSuccess } = require('../../../utils/responseHelpers');
const { hasAdminPermissions } = require('../../../services/hasAdminPermissions');
const { validateEmail, validateMobileNumber } = require('../../../utils/validation');
const { validateUserActionTime } = require('../../../services/validators/userActionValidator');
const PERMISSIONS = require('../../../config/permissions');

exports.editUser = async (req, res, next) => {
  const startTime = Date.now();

  try {
    const requestingUserId = req.user?.userId;
    const { id } = req.params;
    const { name, email, mobileNumber, password, roleId, isActive } = req.body;
        await hasAdminPermissions(requestingUserId, PERMISSIONS.ADMIN.USER.EDIT);

    if (!id) {
      throw new BusinessError('MISSING_REQUIRED_FIELDS', {
        details: { fields: ['id'] },
        traceId: req.traceId,
        retryable: true,
      });
    }

    

    // ✅ Check if user exists
    const userCheck = await pool.query(`SELECT id, email FROM admin_users WHERE id = $1`, [id]);
    if (userCheck.rowCount === 0) {
      throw new BusinessError('USER_NOT_FOUND', { traceId: req.traceId });
    }

    // ✅ Validation
    if (email && !validateEmail(email)) {
      throw new BusinessError('INVALID_EMAIL_FORMAT', { details: { email }, traceId: req.traceId });
    }
    if (mobileNumber && !validateMobileNumber(mobileNumber)) {
      throw new BusinessError('INVALID_MOBILE_NUMBER_FORMAT', { details: { mobileNumber }, traceId: req.traceId });
    }
    if (roleId) {
      const roleCheck = await pool.query('SELECT id FROM admin_roles WHERE id = $1', [roleId]);
      if (roleCheck.rowCount === 0) throw new BusinessError('INVALID_ROLE', { traceId: req.traceId });
    }

    // ✅ Build dynamic updates
    const fieldsToUpdate = [];
    const values = [];
    let idx = 1;

    if (name !== undefined) { fieldsToUpdate.push(`name = $${idx++}`); values.push(name); }
    if (email !== undefined) { fieldsToUpdate.push(`email = $${idx++}`); values.push(email); }
    if (mobileNumber !== undefined) { fieldsToUpdate.push(`phone = $${idx++}`); values.push(mobileNumber); }
    if (password !== undefined) {
      const passwordHash = await bcrypt.hash(password, 10);
      fieldsToUpdate.push(`password_hash = $${idx++}`);
      values.push(passwordHash);
    }

    if (isActive !== undefined) {
      if (typeof isActive !== 'boolean') {
        throw new BusinessError('INVALID_STATUS_FORMAT', {
          details: { fields: ['isActive'], value: isActive },
          traceId: req.traceId,
        });
      }
      try {
        await validateUserActionTime(id);
        fieldsToUpdate.push(`is_active = $${idx++}`);
        values.push(isActive);
      } catch (err) {
        if (!(err instanceof BusinessError && err.code === 'USER_ACTION_NOT_ALLOWED')) {
          throw err;
        }
      }
    }

    // ✅ Run update if needed
    if (fieldsToUpdate.length > 0) {
      const updateQuery = `
        UPDATE admin_users
        SET ${fieldsToUpdate.join(', ')}, updated_at = NOW()
        WHERE id = $${idx}
      `;
      values.push(id);
      await pool.query(updateQuery, values);
    }

    // ✅ Replace role if provided
    if (roleId) {
      await pool.query(`DELETE FROM admin_user_roles WHERE admin_user_id = $1`, [id]);
      await pool.query(
        `INSERT INTO admin_user_roles (admin_user_id, role_id) VALUES ($1, $2)`,
        [id, roleId]
      );
    }

    // ✅ Fetch updated user
    const updatedUserRes = await pool.query(`
      SELECT u.id, u.name, u.email, u.phone, u.is_active, u.created_at, r.role_id
      FROM admin_users u
      LEFT JOIN admin_user_roles r ON u.id = r.admin_user_id
      WHERE u.id = $1
    `, [id]);

    const dbUser = updatedUserRes.rows[0];

    // ✅ Format response in camelCase
    const user = {
      id: dbUser.id,
      name: dbUser.name,
      email: dbUser.email,
      mobileNumber: dbUser.phone,
      roleId: dbUser.role_id,
      isActive: dbUser.is_active,
      createdAt: dbUser.created_at,
    };

    return sendSuccess(
      res,
      'USER_UPDATED',
      { user, meta: { durationMs: Date.now() - startTime } },
      req.traceId
    );

  } catch (err) {
    return next(err);
  }
};
