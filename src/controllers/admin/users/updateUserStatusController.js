const pool = require('../../../config/database');
const BusinessError = require('../../../lib/businessErrors');
const { sendSuccess } = require('../../../utils/responseHelpers');
const { hasAdminPermissions } = require('../../../services/hasAdminPermissions');
const { validateRequiredFields } = require('../../../utils/validation');
const { validateUserActionTime } = require('../../../services/validators/userActionValidator');
const PERMISSIONS = require('../../../config/permissions');

exports.updateUserStatus = async (req, res, next) => {
  const startTime = Date.now();
  try {
    const requestingUserId = req.user?.userId;  // 👈 from token
    const targetUserId = req.params.id;         // 👈 from route param
    const { isActive } = req.body;              // 👈 only from body

    // 1️⃣ Validate required fields (only isActive now)
    const missingFields = validateRequiredFields(req.body, ['isActive']);
    if (missingFields.length > 0) {
      throw new BusinessError('MISSING_REQUIRED_FIELDS', {
        details: { fields: missingFields },
        traceId: req.traceId,
        retryable: true,
      });
    }

    // 2️⃣ Validate isActive is boolean
    if (typeof isActive !== 'boolean') {
      throw new BusinessError('INVALID_TYPE', {
        details: { field: 'isActive', expectedType: 'boolean' },
        traceId: req.traceId,
      });
    }

    // 3️⃣ Permission & validation rules
    if (isActive) {
      // 🔑 Activation → needs ACTIVATE permission + 1-hour validator
      await hasAdminPermissions(requestingUserId, PERMISSIONS.ADMIN.USER.ACTIVATE);
      await validateUserActionTime(targetUserId);
    } else {
      // 🔑 Deactivation → only DEACTIVATE permission (no validator)
      await hasAdminPermissions(requestingUserId, PERMISSIONS.ADMIN.USER.DEACTIVATE);
    }

    // 4️⃣ Check if target user exists
    const userCheck = await pool.query(
      'SELECT id, name, is_active, email, phone, created_at FROM admin_users WHERE id = $1',
      [targetUserId]
    );
    if (userCheck.rowCount === 0) {
      throw new BusinessError('USER_NOT_FOUND', { traceId: req.traceId });
    }

    // 5️⃣ Update status
    const updateQuery = `
      UPDATE admin_users
      SET is_active = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id, name, email, phone AS mobile_number, is_active, created_at
    `;
    const result = await pool.query(updateQuery, [isActive, targetUserId]);
    const updatedUser = result.rows[0];

    // 6️⃣ Format response
    const responseUser = {
      id: updatedUser.id,
      name: updatedUser.name,
      email: updatedUser.email,
      mobileNumber: updatedUser.mobile_number,
      isActive: updatedUser.is_active,
      createdAt: updatedUser.created_at,
    };

    // 7️⃣ Send success
    return sendSuccess(
      res,
      'USER_STATUS_UPDATED',
      {
        user: responseUser,
        meta: { durationMs: Date.now() - startTime },
      },
      req.traceId
    );

  } catch (err) {
    return next(err);
  }
};
