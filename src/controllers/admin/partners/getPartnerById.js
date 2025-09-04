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
          fields: [{ field: 'userId', meta: { reason: 'required' } }]
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
          ku.id AS user_id,
          ku.kitchen_id,
          ku.name,
          ku.phone AS mobilenumber,
          ku.email,
          ku.bio,
          ku.is_kyc_verified,
          ku.status,
          ku.is_primary_owner,
          ku.date_of_birth,
          ku.gender,
          ku.joined_at,
          ku.relation_to_primary_owner,
          kr.id AS role_id,
          kr.name AS role_name,
          kr.label_key AS role_label
        FROM kitchen_users ku
        LEFT JOIN kitchen_user_roles kur ON kur.kitchen_user_id = ku.id
        LEFT JOIN kitchen_roles kr ON kr.id = kur.role_id
        WHERE ku.id = $1 AND ku.deleted_at IS NULL
      `;
      const { rows } = await client.query(query, [userId]);

      if (rows.length === 0) {
        log.warn({ userId }, '⚠️ Partner not found');
        return next(
          new BusinessError('USER.USER_NOT_FOUND', { traceId: req.traceId })
        );
      }

      const row = rows[0];
      const user = {
        user_id: row.user_id,
        kitchen_id: row.kitchen_id,
        name: row.name,
        mobilenumber: row.mobilenumber,
        email: row.email,
        bio: row.bio,
        is_kyc_verified: row.is_kyc_verified,
        status: row.status,
        is_primary_owner: row.is_primary_owner,
        date_of_birth: row.date_of_birth,
        gender: row.gender,
        joined_at: row.joined_at,
        relation_to_primary_owner: row.relation_to_primary_owner,
        role: row.role_id
          ? {
            
              name: row.role_name,
             
            }
          : {}
      };

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
