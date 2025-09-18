const { pool } = require('../../config/database');
const BusinessError = require('../../lib/businessErrors');
const { sendSuccess } = require('../../utils/responseHelpers');
const logger = require('../../config/logger');
const { hasAdminPermissions } = require('../../services/hasAdminPermissions');
const PERMISSIONS = require('../../config/permissions');
// Import kitchen workflows
const {
  syncKitchenFromStaging,
  approveFullKitchen
} = require('../../services/RequestFlows/kitchens/kitchen');
const { syncKitchenAddressesFromStaging } = require('../../services/RequestFlows/kitchens/KitchenAddresses');
const { syncKitchenAvailabilityFromStaging } = require('../../services/RequestFlows/kitchens/kitchenAvailability');

const { approveKitchenMedia } = require('../../services/RequestFlows/kitchens/kitchenMedia');

exports.approveRequest = async (req, res, next) => {
  const client = await pool.connect();
  const log = logger.withTrace(req);

  try {
    log.info({}, '[approveRequest] Request started');

    const adminUserId = req.user?.userId;
    const { requestId } = req.params;
 
    await hasAdminPermissions(adminUserId, PERMISSIONS.ADMIN.REQUEST.APPROVE);
    if (!requestId) {
      log.warn({ adminUserId }, '[approveRequest] Missing requestId in params');
      throw new BusinessError('COMMON.MISSING_REQUIRED_FIELDS', {
        traceId: req.traceId,
        details: { fields: ['requestId'] },
      });
    }

    log.info({ requestId }, '[approveRequest] Fetching change request from DB');
    const { rows } = await client.query(
      `SELECT id, entity_name, entity_id, sub_entity_id, action, status
       FROM change_requests
       WHERE id = $1`,
      [requestId]
    );

    if (!rows.length) {
      log.error({ requestId }, '[approveRequest] Change request not found');
      throw new BusinessError('COMMON.NOT_FOUND', {
        traceId: req.traceId,
        details: { entity: 'change_requests', id: requestId },
      });
    }

    const request = rows[0];
    log.info({ request }, '[approveRequest] Change request fetched successfully');

    // Block if already processed
    if (['APPROVED', 'REJECTED'].includes(request.status)) {
      log.warn({ requestId, status: request.status }, '[approveRequest] Request already processed');
      throw new BusinessError('REQUEST.ALREADY_PROCESSED', {
        traceId: req.traceId,
        details: { id: requestId, status: request.status },
      });
    }

    log.info({ requestId, action: request.action }, '[approveRequest] Starting approval workflow');

    // Execute workflow based on entity and action
    if (request.entity_name === 'kitchens') {
      switch (request.action) {
        case 'KITCHEN_UPDATED':
          log.info({ kitchenId: request.entity_id }, '[approveRequest] Syncing kitchen updates from staging');
          await syncKitchenFromStaging(request.entity_id, req.traceId);
          log.info({ kitchenId: request.entity_id }, '[approveRequest] Kitchen update synced successfully');
          break;

        case 'KITCHEN_ADDRESS_UPDATED':
          log.info({ kitchenId: request.entity_id, addressId: request.sub_entity_id }, '[approveRequest] Syncing kitchen address updates');
          await syncKitchenAddressesFromStaging(request.entity_id, request.sub_entity_id, req.traceId);
          log.info({ kitchenId: request.entity_id, addressId: request.sub_entity_id }, '[approveRequest] Kitchen address synced successfully');
          break;

        case 'KITCHEN_AVAILABILITY_UPDATED':
          log.info({ kitchenId: request.entity_id }, '[approveRequest] Syncing kitchen availability updates');
          await syncKitchenAvailabilityFromStaging(request.entity_id, req.traceId);
          log.info({ kitchenId: request.entity_id }, '[approveRequest] Kitchen availability synced successfully');
          break;

        case 'KITCHEN_CREATED':
          log.info({ kitchenId: request.entity_id }, '[approveRequest] Approving full kitchen creation');
          await approveFullKitchen(request.entity_id, req.traceId);
          log.info({ kitchenId: request.entity_id }, '[approveRequest] Kitchen created and approved successfully');
          break;

        
        case 'KITCHEN_ADDRESS_ADDED':
        log.info({ kitchenId: request.entity_id, addressId: request.sub_entity_id }, '[approveRequest] Syncing kitchen address addition');
          await syncKitchenAddressesFromStaging(request.entity_id, request.sub_entity_id, req.traceId);
          log.info({ kitchenId: request.entity_id }, '[approveRequest] Kitchen address added and approved successfully');
          break;
             case 'KITCHEN_MEDIA_UPLOADED':
        log.info({ kitchenId: request.entity_id, mediaId: request.sub_entity_id }, '[approveRequest] approve kitchen media');
          await approveKitchenMedia(request.entity_id, request.sub_entity_id, req.traceId);
          log.info({ kitchenId: request.entity_id }, '[approveRequest] Kitchen media approved successfully');
          break;

        default:
          log.error({ action: request.action }, '[approveRequest] Unsupported action in request');
          throw new BusinessError('REQUEST.UNSUPPORTED_ACTION', {
            traceId: req.traceId,
            details: { action: request.action },
          });
      }
    } else {
      log.warn({ entity: request.entity_name }, '[approveRequest] Unsupported entity for approval');
    }

    log.info({ requestId, adminUserId }, '[approveRequest] Updating change request status to approved');
    await client.query(
      `UPDATE change_requests
       SET status = 'APPROVED',
           reviewed_by = $1,
           reviewed_at = NOW(),
           updated_at = NOW()
       WHERE id = $2`,
      [adminUserId, requestId]
    );
    log.info({ requestId, adminUserId }, '[approveRequest] Change request marked as approved');

    return sendSuccess(res, 'REQUEST.APPROVED', { requestId }, req.traceId);

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    log.error({ err }, '[approveRequest] ❌ Error during approval workflow');
    return next(err);
  } finally {
    client.release();
    log.debug({}, '[approveRequest] DB client released');
  }
};
