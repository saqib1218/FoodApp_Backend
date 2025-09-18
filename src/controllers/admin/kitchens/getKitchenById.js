const { pool } = require('../../../config/database');
const { sendSuccess } = require('../../../utils/responseHelpers');
const logger = require('../../../config/logger');
const BusinessError = require('../../../lib/businessErrors');
const { hasAdminPermissions } = require('../../../services/hasAdminPermissions');

const PERMISSIONS = require('../../../config/permissions');
exports.getKitchenById = async (req, res, next) => {
  const log = logger.withTrace(req);
  const kitchenId = req.params.kitchenId;
  const adminUserId = req.user?.userId;
  // Use state instead of status, map active → main

  const state=req.query.state === 'staging' || req.query.status === 'DRAFT'
      ? 'staging'
      : 'main';
     await hasAdminPermissions(adminUserId, PERMISSIONS.ADMIN.KITCHEN.DETAIL_VIEW);
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
    log.info({ kitchenId, state }, '[getKitchenById] request started');

    // 2️⃣ Fetch from PostgreSQL
    const client = await pool.connect();
    try {
      const query =
        state === 'staging'
          ? 'SELECT * FROM kitchens_staging WHERE kitchen_id = $1'
          : 'SELECT * FROM kitchens WHERE id = $1';

      const { rows } = await client.query(query, [kitchenId]);

      if (rows.length === 0) {
        throw new BusinessError('KITCHEN.NOT_FOUND', `Kitchen with id ${kitchenId} not found`);
      }

      const kitchen = rows[0];
      log.info({ kitchenId }, '✅ Kitchen fetched from DB');

      return sendSuccess(res, 'KITCHEN.FETCHED', kitchen, req.traceId);
    } finally {
      client.release();
      log.debug({}, 'DB client released');
    }
  } catch (err) {
    log.error({ err }, '❌ Error fetching kitchen by ID');
    return next(err);
  }
};
