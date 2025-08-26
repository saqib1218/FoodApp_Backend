
const { pool } = require('../../../config/database');
const BusinessError = require('../../../lib/businessErrors');
const { sendSuccess } = require('../../../utils/responseHelpers');

exports.createChefInvitationByAdmin = async (req, res, next) => {
  try {
    const { phone, role, owner_id, kitchen_id } = req.body;
    const { user_id } = req.user; // admin token

    if (!phone || !role || !owner_id || !kitchen_id) {
      return next(new BusinessError('MISSING_REQUIRED_FIELDS', { traceId: req.traceId }));
    }

    // Verify owner exists
    const ownerResult = await pool.query(
      `SELECT id FROM kitchen_users WHERE id = $1 AND deleted_at IS NULL`,
      [owner_id]
    );

    if (ownerResult.rows.length === 0) {
      return next(new BusinessError('USER_NOT_FOUND', { traceId: req.traceId }));
    }

    // Create invitation via service
    const invitation = await KitchenInvitationService.createInvitation({
      kitchen_id,
      invited_by_id: user_id, // admin is creating
      phone,
      role,
      traceId: req.traceId,
    });

    return sendSuccess(res, {
      message: 'Invitation created successfully by admin',
      data: invitation,
      traceId: req.traceId,
    });

  } catch (err) {
    return next(err);
  }
};
