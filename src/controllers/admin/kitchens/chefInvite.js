const crypto = require('crypto');
const { pool } = require('../../../config/database');
const BusinessError = require('../../../lib/businessErrors');
const { sendSuccess } = require('../../../utils/responseHelpers');
const { hasAdminPermissions } = require('../../../services/hasAdminPermissions');
const PERMISSIONS = require('../../../config/permissions');

/**
 * Create Chef Invitation (Admin)
 * POST /kitchen/:kitchenId/chef-invitations
 */
exports.createChefInvitation = async (req, res, next) => {
  const traceId = req.traceId;
  const adminUserId = req.user?.userId; // ✅ admin from token
  const { kitchenId } = req.params;
  const { ownerUserId, mobileNumber, role } = req.body;

  try {
    // 1️⃣ Check admin permission first
    const allowed = await hasAdminPermissions(adminUserId, PERMISSIONS.ADMIN.KITCHEN.INVITE_CHEF);
    if (!allowed) {
      return next(new BusinessError('USER_NOT_AUTHORIZED', { traceId }));
    }

    // 2️⃣ Validate required fields
    const missingFields = [];
    if (!ownerUserId) missingFields.push('ownerUserId');
    if (!mobileNumber) missingFields.push('mobileNumber');
    if (!role) missingFields.push('role');

    if (missingFields.length > 0) {
      return next(new BusinessError('MISSING_REQUIRED_FIELDS', { traceId, details: missingFields }));
    }

    // 3️⃣ Verify kitchen belongs to the owner
    const kitchenCheck = await pool.query(
      `SELECT ku.id 
       FROM kitchen_users ku
       WHERE ku.user_id = $1 AND ku.kitchen_id = $2 AND ku.deleted_at IS NULL`,
      [ownerUserId, kitchenId]
    );

    if (kitchenCheck.rowCount === 0) {
      return next(new BusinessError('INVALID_KITCHEN_OWNER_RELATION', { traceId }));
    }

    // 4️⃣ Generate invitation code
    const invitation_code = crypto.randomBytes(4).toString('hex');

    // 5️⃣ Set expiry (7 days)
    const expires_at = new Date();
    expires_at.setDate(expires_at.getDate() + 7);

    // 6️⃣ Insert directly into main table
    const mainInsert = await pool.query(
      `INSERT INTO kitchen_user_invitations 
         (kitchen_id, invited_by_id, phone, role, invitation_code, expires_at, created_by, updated_by, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())
       RETURNING id, invitation_code, status, expires_at`,
      [
        kitchenId,
        adminUserId, // ✅ invited by admin
        mobileNumber,
        role,
        invitation_code,
        expires_at,
        adminUserId,
        adminUserId
      ]
    );

    const invitation = mainInsert.rows[0];

    // 7️⃣ Return success
    return sendSuccess(res, 'CHEF_INVITATION_CREATED', invitation, traceId);

  } catch (err) {
    console.error('❌ Error creating chef invitation:', err);
    return next(err);
  }
};
