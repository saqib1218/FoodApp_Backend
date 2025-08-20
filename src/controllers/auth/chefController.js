const { pool } = require('../../config/database');
const { validateRequiredFields } = require('../../utils/validation');
const BusinessError = require('../../lib/businessErrors');
const { sendSuccess } = require('../../utils/responseHelpers');

/**
 * POST /chef/signup/validate
 * Validates chef signup invitation code
 * 
 * Requirements:
 * - Token is already validated by middleware
 * - req.user.user_id contains the logged-in user's ID
 * - Validates invitation_code from req.body
 * - Checks kitchen_user_invitations table for valid invitation tied to user
 * - Returns invitation details if valid
 */

const { assignRoleToUser } = require('../../services/assignRoleToUser');

exports.chefSignupValidation = async (req, res, next) => {
  try {
    const { invitation_code } = req.body;
    const { userId } = req.user;

    // 1️⃣ Validate required fields
    const missing = validateRequiredFields(req.body, ['invitation_code']);
    if (missing.length) {
      throw new BusinessError('MISSING_REQUIRED_FIELDS', {
        details: missing.map(f => ({ field: f, reason: 'REQUIRED' })),
        traceId: req.traceId,
      });
    }

    // 2️⃣ Validate invitation code for user
    const query = `
      SELECT 
        kui.id AS invitation_id,
        kui.kitchen_id,
        kui.role,
        kui.phone
      FROM kitchen_user_invitations kui
      JOIN kitchen_users ku ON ku.phone = kui.phone
      WHERE kui.invitation_code = $1
        AND ku.id = $2
        AND kui.status = 'pending'
        AND kui.deleted_at IS NULL
        AND (kui.expires_at IS NULL OR kui.expires_at > NOW())
      LIMIT 1
    `;
    const result = await pool.query(query, [invitation_code, user_id]);

    if (result.rows.length === 0) {
      throw new BusinessError('INVITATION_NOT_FOUND', { traceId: req.traceId });
    }

    const invitation = result.rows[0];

    // 3️⃣ Mark invitation as accepted
    const updateResult = await pool.query(
      `UPDATE kitchen_user_invitations
       SET status = 'accepted'
       WHERE id = $1 AND status = 'pending'`,
      [invitation.invitation_id]
    );

    if (updateResult.rowCount === 0) {
      throw new BusinessError('INVITATION_ALREADY_USED', { traceId: req.traceId });
    }

    // 4️⃣ Assign chef role
    try {
      await assignRoleToUser(user_id, 'chef');
    } catch (roleErr) {
      console.error('❌ Error assigning chef role:', roleErr);
      throw new BusinessError('ROLE_ASSIGNMENT_FAILED', {
        message: 'Failed to assign chef role.',
        traceId: req.traceId,
        retryable: true
      });
    }

    // 5️⃣ Return success using catalog
    return sendSuccess(res, 'CHEF_INVITATION_VALIDATED_SUCCESS', {
      invitation_id: invitation.invitation_id,
      kitchen_id: invitation.kitchen_id,
      role: invitation.role
    }, req.traceId);

  } catch (err) {
    return next(err);
  }
};

exports.updateChefProfile = async (req, res, next) => {
  try {
    const { name, email, bio, date_of_birth, gender } = req.body;
    const { userId } = req.user;

    if (!name && !email && !bio && !date_of_birth && !gender) {
      throw new BusinessError('NO_FIELDS_PROVIDED', { traceId: req.traceId });
    }

    const userResult = await pool.query(
      'SELECT id FROM kitchen_users WHERE id = $1 AND deleted_at IS NULL',
      [userId]
    );
    if (userResult.rows.length === 0) {
      throw new BusinessError('USER_NOT_FOUND', { traceId: req.traceId });
    }

    if (email) {
      const emailCheck = await pool.query(
        'SELECT id FROM kitchen_users WHERE email = $1 AND id != $2 AND deleted_at IS NULL',
        [email, userId]
      );
      if (emailCheck.rows.length > 0) {
        throw new BusinessError('EMAIL_ALREADY_USED', { traceId: req.traceId });
      }
    }

    await pool.query(
      `UPDATE kitchen_users SET
        name = COALESCE($1, name),
        email = COALESCE($2, email),
        bio = COALESCE($3, bio),
        date_of_birth = COALESCE($4, date_of_birth),
        gender = COALESCE($5, gender)
       WHERE id = $6`,
      [name, email, bio, date_of_birth, gender, userId]
    );

    return sendSuccess(res, 'USER_PROFILE_UPDATED_SUCCESS', req.traceId);

  } catch (err) {
    return next(err);
  }
};
