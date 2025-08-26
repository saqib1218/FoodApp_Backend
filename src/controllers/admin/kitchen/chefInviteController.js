const crypto = require('crypto');
const { pool } = require('../../../config/database');
const BusinessError = require('../../../lib/businessErrors');
const { sendSuccess } = require('../../../utils/responseHelpers');
const { hasPermission } = require('../../../services/permissionService');

exports.createChefInvitation = async (req, res, next) => {
  const traceId = req.traceId;
  const { userId } = req.user; // from JWT

  try {
    const { mobileNumber, role } = req.body;

    // 1️⃣ Validate required fields
    const missingFields = [];
    if (!mobileNumber) missingFields.push('mobileNumber');
    if (!role) missingFields.push('role');

    if (missingFields.length > 0) {
      return next(new BusinessError('MISSING_REQUIRED_FIELDS', {
        traceId,
        details: missingFields
      }));
    }

    // 2️⃣ Check permission
    const allowed = await hasPermission(userId, 'kitchen.chefInvite.create');
    if (!allowed) {
      return next(new BusinessError('KITCHEN_NOT_FOUND', {
        traceId,
        message: 'You do not have permission to invite chefs.'
      }));
    }

    // 3️⃣ Verify inviter exists and has a kitchen
    const ownerResult = await pool.query(
      `SELECT id, kitchen_id
       FROM kitchen_users
       WHERE id = $1 AND deleted_at IS NULL`,
      [userId]
    );

    if (ownerResult.rows.length === 0) {
      return next(new BusinessError('USER_NOT_FOUND', { traceId }));
    }

    const kitchen_id = ownerResult.rows[0].kitchen_id;
    if (!kitchen_id) {
      return next(new BusinessError('KITCHEN_NOT_FOUND', { traceId }));
    }

    // 4️⃣ Generate a random invitation code
    const invitation_code = crypto.randomBytes(4).toString('hex');

    // 5️⃣ Set automatic expiry (7 days)
    const expires_at = new Date();
    expires_at.setDate(expires_at.getDate() + 7);

    // 6️⃣ Insert invitation record
    const insertQuery = `
      INSERT INTO kitchen_user_invitations
        (kitchen_id, invited_by_id, phone, role, invitation_code, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, invitation_code, status, expires_at
    `;
    const insertResult = await pool.query(insertQuery, [
      kitchen_id,
      userId,
      mobileNumber, // updated here
      role,
      invitation_code,
      expires_at
    ]);

    const invitation = insertResult.rows[0];

    // 7️⃣ Return success response
    return sendSuccess(res, 'CHEF_INVITATION_CREATED', invitation, traceId);

  } catch (err) {
    return next(err);
  }
};
