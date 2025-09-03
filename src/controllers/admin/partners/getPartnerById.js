// src/controllers/admin/kitchenController.js
const { pool } = require('../../../config/database');
const { sendSuccess } = require('../../../utils/responseHelpers');
const BusinessError = require('../../../lib/businessErrors');
const logger = require('../../../config/logger');
const { hasAdminPermissions } = require('../../../services/hasAdminPermissions');
const PERMISSIONS = require('../../../config/permissions');

exports.getPartnerById = async (req, res, next) => {
  const log = logger.withTrace(req);
  const userId = req.params.id;
  const adminUserId = req.user?.userId;

  await hasAdminPermissions(adminUserId, PERMISSIONS.ADMIN.PARTNER.DETAIL_VIEW);

  // Validate required param
  if (!userId) {
    log.warn('No userId provided');
    return next(
      new BusinessError('COMMON.MISSING_REQUIRED_FIELDS', {
        traceId: req.traceId,
        details: {
          fields: [
            { field: 'userId', meta: { reason: 'required' } }
          ]
        }
      })
    );
  }

  try {
    log.info({ userId }, '[getPartnerById] request started');

    const client = await pool.connect();
    try {
      const query = `
        SELECT 
          id AS user_id,
          kitchen_id,
          name,
          phone AS mobilenumber,
          email,
          bio,
          is_kyc_verified,
          status,
          is_primary_owner,
          date_of_birth,
          gender,
          joined_at,
          relation_to_primary_owner
        FROM kitchen_users
        WHERE id = $1 AND deleted_at IS NULL
      `;
      const { rows } = await client.query(query, [userId]);

      if (rows.length === 0) {
        log.warn({ userId }, '⚠️ Partner not found');
        // ✅ Use BusinessError instead of sendError
        return next(
          new BusinessError('USER.USER_NOT_FOUND', { traceId: req.traceId })
        );
      }

      const user = rows[0];
      log.info({ userId, user }, '✅ Partner fetched from DB');

      return sendSuccess(res, 'USER.USER_FETCHED', user);
    } finally {
      client.release();
      log.debug('DB client released');
    }

  } catch (err) {
    log.error({ err }, '❌ Error fetching partner');
    return next(err);
  }
};
