const { pool } = require('../../../config/database');
const BusinessError = require('../../../lib/businessErrors');
const { sendSuccess } = require('../../../utils/responseHelpers');
const logger = require('../../../config/logger');
const { hasAdminPermissions } = require('../../../services/hasAdminPermissions');
const PERMISSIONS = require('../../../config/permissions');

exports.getKitchenChangeRequests = async (req, res, next) => {
  const log = logger.withTrace(req);
  const kitchenId = req.params.kitchenId;
  const adminUserId = req.user?.userId;

  if (!kitchenId) {
    return next(
      new BusinessError('COMMON.MISSING_REQUIRED_FIELDS', {
        traceId: req.traceId,
        details: { fields: ['kitchenId'], meta: { reason: 'required' } },
      })
    );
  }

  let client;
  try {
    // ✅ Permission check
    await hasAdminPermissions(adminUserId, PERMISSIONS.ADMIN.KITCHEN.REQUEST_LIST_VIEW);

    client = await pool.connect();
    log.info({ kitchenId, adminUserId }, '[getKitchenChangeRequests] Fetching change requests');

    const { rows } = await client.query(
      `SELECT *
         FROM change_requests
        WHERE entity_name = 'kitchens'
          AND entity_id = $1
        ORDER BY created_at DESC`,
      [kitchenId]
    );

    return sendSuccess(
      res,
      'KITCHEN.REQUESTS_FETCHED',
      rows,
      req.traceId
    );
  } catch (err) {
    log.error({ err }, '[getKitchenChangeRequests] ❌ Error fetching change requests');
    return next(err);
  } finally {
    if (client) client.release();
  }
};
