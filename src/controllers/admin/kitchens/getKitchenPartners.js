const { pool } = require('../../../config/database');
const { sendSuccess } = require('../../../utils/responseHelpers');
const logger = require('../../../config/logger');
const { hasAdminPermissions } = require('../../../services/hasAdminPermissions');
const PERMISSIONS = require('../../../config/permissions');
exports.getKitchenPartners = async (req, res, next) => {
  const log = logger.withTrace(req);
  const kitchenId = req.params.kitchenId;
  const adminUserId = req.user?.userId;

  await hasAdminPermissions(adminUserId, PERMISSIONS.ADMIN.KITCHEN.PARTNER_LIST);

if (!kitchenId) {
  log.warn('No kitchenId provided');
  return next(
    new BusinessError('COMMON.MISSING_REQUIRED_FIELDS', {
      traceId: req.traceId,
      details: {
        fields: [
          { field: 'KitchenId', meta: { reason: 'required' } }
        ],
    
      }
    })
  );
}


  log.info({ kitchenId }, '[getKitchenPartners] request started');

  // Fetch from PostgreSQL
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
        kr.name AS role_name
      FROM kitchen_users ku
      LEFT JOIN kitchen_user_roles rur 
        ON rur.kitchen_user_id = ku.id
      LEFT JOIN kitchen_roles kr
        ON rur.role_id = kr.id AND kr.status = 'active'
      WHERE ku.deleted_at IS NULL
        AND ku.kitchen_id = $1
      ORDER BY ku.name
    `;

    log.info({ query, params: [kitchenId] }, 'Executing SQL query');

    const { rows } = await client.query(query, [kitchenId]);
    log.info({ rowsCount: rows.length, rowsSample: rows.slice(0, 5) }, 'Rows returned from DB');

    // Group roles per user
    const partnersMap = {};
    rows.forEach(row => {
      const { user_id, role_name, ...userData } = row;
      if (!partnersMap[user_id]) partnersMap[user_id] = { ...userData, roles: [] };
      if (role_name && !partnersMap[user_id].roles.includes(role_name)) {
        partnersMap[user_id].roles.push(role_name);
      }
    });

    const partners = Object.values(partnersMap);
    log.info({ partnersCount: partners.length, partnersSample: partners.slice(0, 5) }, 'Partners grouped');

    return sendSuccess(res, 'KITCHEN.PARTNERS_FETCHED', partners, req.traceId);
  } catch (err) {
    log.error({ err }, '❌ Error fetching kitchen partners');
    return next(err);
  } finally {
    client.release();
    log.debug({}, 'DB client released');
  }
};
