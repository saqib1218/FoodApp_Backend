const { pool } = require('../../../config/database');
const BusinessError = require('../../../lib/businessErrors');
const { sendSuccess } = require('../../../utils/responseHelpers');
const logger = require('../../../config/logger');
const { hasAdminPermissions } = require('../../../services/hasAdminPermissions');
const PERMISSIONS = require('../../../config/permissions');
exports.submitKitchenForApproval = async (req, res, next) => {
  const client = await pool.connect();
  const log = logger.withTrace(req);

  try {
    const kitchenId = req.params.kitchenId;
    const { reason } = req.body;
    const adminUserId = req.user?.userId;
    const adminRole = 'BACKEND';

    log.info({ kitchenId, adminUserId }, '[submitKitchenForApproval] Request started');
        // ✅ Permission check
    await hasAdminPermissions(adminUserId, PERMISSIONS.ADMIN.KITCHEN.SUBMIT);

    if (!kitchenId) {
      log.warn({ adminUserId }, '[submitKitchenForApproval] Missing kitchenId');
      throw new BusinessError('COMMON.MISSING_REQUIRED_FIELDS', { 
        traceId: req.traceId, 
        details: { fields: ['kitchenId'] } 
      });
    }

    await client.query('BEGIN');

    // 1️⃣ Check main kitchen exists
    const { rows: kitchenRows } = await client.query(
      `SELECT id, status FROM kitchens WHERE id = $1 AND deleted_at IS NULL`,
      [kitchenId]
    );

    if (!kitchenRows.length) {
      log.error({ kitchenId }, '[submitKitchenForApproval] Kitchen not found');
      throw new BusinessError('KITCHEN.NOT_FOUND', { traceId: req.traceId });
    }
    log.info({ kitchenId }, '[submitKitchenForApproval] Kitchen exists');

    // 2️⃣ Update main kitchen status to submitted
    const { rows: updatedKitchenRows } = await client.query(
      `UPDATE kitchens
         SET status = 'SUBMITTED', updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [kitchenId]
    );

    log.info({ kitchenId }, '[submitKitchenForApproval] Kitchen status updated to submitted');

    // 3️⃣ Create a change request for approval tracking (without payload)
    const { rows: changeRequestRows } = await client.query(
      `INSERT INTO change_requests
        (requested_by, requested_by_role, entity_name, entity_id, action, reason, status, workflow_id, created_at, updated_at)
       VALUES ($1, $2, 'kitchens', $3, 'KITCHEN_CREATED', $4, 'INITIATED', 'BACKEND_APPROVAL', NOW(), NOW())
       RETURNING *`,
      [adminUserId, adminRole, kitchenId, reason || null]
    );

    log.info({ changeRequestId: changeRequestRows[0].id }, '[submitKitchenForApproval] Change request created');

    await client.query('COMMIT');
    log.info({ kitchenId, changeRequestId: changeRequestRows[0].id }, '[submitKitchenForApproval] Transaction committed');

    return sendSuccess(res, 'KITCHEN.SUBMITTED_FOR_APPROVAL', {
      change_request: changeRequestRows[0],
      kitchen: updatedKitchenRows[0],
    }, req.traceId);

  } catch (err) {
    await client.query('ROLLBACK');
    log.error({ err }, '[submitKitchenForApproval] Transaction rolled back due to error');
    return next(err);
  } finally {
    client.release();
    log.debug({}, '[submitKitchenForApproval] DB client released');
  }
};
