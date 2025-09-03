const { pool } = require('../../../config/database');

const { sendSuccess } = require('../../../utils/responseHelpers');
const BusinessError = require('../../../lib/businessErrors');
const logger = require('../../../config/logger');
const { hasAdminPermissions } = require('../../../services/hasAdminPermissions');

const PERMISSIONS = require('../../../config/permissions');
exports.getKitchenAvailabilityById = async (req, res, next) => {
  const log = logger.withTrace(req);
  const kitchenId = req.params.id;
  const adminUserId = req.user?.userId;
  const state = req.query.state === 'staging' ? 'staging' : 'main';
  const redisKey = `kitchen:${kitchenId}:availability:${state}`;
     await hasAdminPermissions(adminUserId, PERMISSIONS.ADMIN.KITCHEN.AVAILABILITY_VIEW);
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


  try {
    log.info({ kitchenId, state, redisKey }, '[getKitchenAvailabilityById] request started');

    // 2️⃣ Fetch from DB
    const client = await pool.connect();
    try {
      const table = state === 'staging' ? 'kitchen_availability_staging' : 'kitchen_availability';
      const query = `
        SELECT *
        FROM ${table}
        WHERE kitchen_id = $1
        ORDER BY day_of_week_id, slot_id
      `;
      log.info({ query, params: [kitchenId], table }, 'Executing SQL query');

      const { rows: availability } = await client.query(query, [kitchenId]);
      log.info({ count: availability.length, sample: availability.slice(0, 5) }, 'DB rows fetched');

      // Return empty array if nothing found
      if (!availability.length) {
        log.info(`No availability found for kitchen ${kitchenId} with state ${state}`);
        return sendSuccess(res, 'KITCHEN.KITCHEN_AVAILABILITY_FETCHED', [], req.traceId);
      }


      return sendSuccess(res, 'KITCHEN.KITCHEN_AVAILABILITY_FETCHED', availability, req.traceId);
    } finally {
      client.release();
      log.debug('DB client released');
    }
  } catch (err) {
    log.error({ err }, '❌ Error fetching kitchen availability');
     return next(err);
    
  }
};
