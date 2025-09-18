const { pool } = require('../../../config/database');
const { sendSuccess } = require('../../../utils/responseHelpers');
const logger = require('../../../config/logger');
const { hasAdminPermissions } = require('../../../services/hasAdminPermissions');

const PERMISSIONS = require('../../../config/permissions');
exports.getKitchenAddressesById = async (req, res, next) => {
  const log = logger.withTrace(req);
  const kitchenId = req.params.kitchenId;
  const adminUserId = req.user?.userId;

    await hasAdminPermissions(adminUserId, PERMISSIONS.ADMIN.KITCHEN.ADDRESS_VIEW);
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


  const state =
    req.query.state === 'staging' || req.query.status === 'DRAFT'
      ? 'staging'
      : 'main';

  try {
    log.info({ kitchenId, state }, '[getKitchenAddressesById] request started');

    // Fetch from PostgreSQL
    const client = await pool.connect();
    try {
      let rows;
      if (state === 'staging') {
        // Join with kitchens_staging to get the correct kitchen_staging_id
        const query = `
          SELECT kas.*
          FROM kitchen_addresses_staging kas
          JOIN kitchens_staging ks ON ks.id = kas.kitchen_staging_id
          WHERE ks.kitchen_id = $1
          ORDER BY kas.created_at DESC
        `;
        log.info({ query, params: [kitchenId] }, 'Executing staging SQL query');
        const result = await client.query(query, [kitchenId]);
        rows = result.rows;
      } else {
        const query = `
          SELECT *
          FROM kitchen_addresses
          WHERE kitchen_id = $1
          ORDER BY created_at DESC
        `;
        log.info({ query, params: [kitchenId] }, 'Executing main SQL query');
        const result = await client.query(query, [kitchenId]);
        rows = result.rows;
      }

      log.info({ rowCount: rows.length, sample: rows.slice(0, 5) }, 'DB rows fetched');

      return sendSuccess(res, 'KITCHEN.ADDRESSES_FETCHED', rows, req.traceId);
    } finally {
      client.release();
      log.debug('DB client released');
    }
  } catch (err) {
    log.error({ err }, '❌ Error fetching kitchen addresses');
    return next(err);
  }
};
