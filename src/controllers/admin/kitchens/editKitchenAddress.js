const { pool } = require('../../../config/database');
const BusinessError = require('../../../lib/businessErrors');
const { sendSuccess } = require('../../../utils/responseHelpers');
const logger = require('../../../config/logger');
const { hasAdminPermissions } = require('../../../services/hasAdminPermissions');
const PERMISSIONS = require('../../../config/permissions');

exports.editKitchenAddress = async (req, res, next) => {
  const kitchenId = req.params.kitchenId;
  const addressId = req.params.addressId;
  const log = logger.withTrace(req);
  const adminUserId = req.user?.userId;

  const {
    addressName,
    addressLine1,
    addressLine2,
    city,
    state,
    zone,
    postalCode,
    country,
    nearestLocation,
    deliveryInstruction,
    latitude,
    longitude,
    placeId,
    formattedAddress,
    mapLink
  } = req.body;

  let client;

  try {
    log.info({ kitchenId, addressId, adminUserId }, '[editKitchenAddress] Request started');

    // Permission check
    await hasAdminPermissions(adminUserId, PERMISSIONS.ADMIN.KITCHEN.EDIT_ADDRESS);
    log.info({ adminUserId }, '[editKitchenAddress] Admin permissions verified');

    // Required fields validation
    if (!kitchenId || !addressId) {
      log.warn({ kitchenId, addressId, adminUserId }, '[editKitchenAddress] Missing required fields');
      throw new BusinessError('COMMON.MISSING_REQUIRED_FIELDS', {
        traceId: req.traceId,
        details: { fields: ['kitchenId', 'addressId'], meta: { reason: 'required' } }
      });
    }

    // Check if request body has fields to update
    if (
      !addressName && !addressLine1 && !addressLine2 &&
      !city && !state && !zone && !postalCode &&
      !country && !nearestLocation && !deliveryInstruction &&
      !latitude && !longitude && !placeId && !formattedAddress && !mapLink
    ) {
      log.warn({ adminUserId }, '[editKitchenAddress] No fields provided to update');
      throw new BusinessError('COMMON.NO_FIELDS_TO_UPDATE', {
        traceId: req.traceId,
        details: { fields: Object.keys(req.body), meta: { reason: 'empty_update' } }
      });
    }

    client = await pool.connect();
    await client.query('BEGIN');
    log.info({ kitchenId }, '[editKitchenAddress] Database transaction started');

    // 1️⃣ Check kitchen status
    const { rows: kitchenRows } = await client.query(
      `SELECT status FROM kitchens WHERE id = $1`,
      [kitchenId]
    );

    if (!kitchenRows.length) {
      log.error({ kitchenId }, '[editKitchenAddress] Kitchen not found');
      throw new BusinessError('KITCHEN.NOT_FOUND', { traceId: req.traceId });
    }

    const kitchenStatus = kitchenRows[0].status;
    log.info({ kitchenId, kitchenStatus }, '[editKitchenAddress] Kitchen status checked');

    if (kitchenStatus === 'SUBMITTED') {
      log.warn({ kitchenId }, '[editKitchenAddress] Kitchen update not allowed, status submitted');
      throw new BusinessError('KITCHEN.UPDATE_NOT_ALLOWED', {
        traceId: req.traceId,
        details: { fields: ['kitchenId'], meta: { reason: 'status_submitted' } }
      });
    }

    // 2️⃣ If draft → update staging table
    if (kitchenStatus === 'DRAFT') {
      log.info({ kitchenId }, '[editKitchenAddress] Kitchen is draft, updating staging');
      const fields = [];
      const values = [];
      let idx = 1;

      if (addressName !== undefined) { fields.push(`address_name = $${idx++}`); values.push(addressName || null); }
      if (addressLine1 !== undefined) { fields.push(`address_line1 = $${idx++}`); values.push(addressLine1 || null); }
      if (addressLine2 !== undefined) { fields.push(`address_line2 = $${idx++}`); values.push(addressLine2 || null); }
      if (city !== undefined) { fields.push(`city = $${idx++}`); values.push(city || null); }
      if (state !== undefined) { fields.push(`state = $${idx++}`); values.push(state || null); }
      if (zone !== undefined) { fields.push(`zone = $${idx++}`); values.push(zone || null); }
      if (postalCode !== undefined) { fields.push(`postal_code = $${idx++}`); values.push(postalCode || null); }
      if (country !== undefined) { fields.push(`country = $${idx++}`); values.push(country || null); }
      if (nearestLocation !== undefined) { fields.push(`nearest_location = $${idx++}`); values.push(nearestLocation || null); }
      if (deliveryInstruction !== undefined) { fields.push(`delivery_instruction = $${idx++}`); values.push(deliveryInstruction || null); }
      if (latitude !== undefined) { fields.push(`latitude = $${idx++}`); values.push(latitude || null); }
      if (longitude !== undefined) { fields.push(`longitude = $${idx++}`); values.push(longitude || null); }
      if (placeId !== undefined) { fields.push(`place_id = $${idx++}`); values.push(placeId || null); }
      if (formattedAddress !== undefined) { fields.push(`formatted_address = $${idx++}`); values.push(formattedAddress || null); }
      if (mapLink !== undefined) { fields.push(`map_link = $${idx++}`); values.push(mapLink || null); }

      values.push(addressId);

      const { rows: updatedRows } = await client.query(
        `UPDATE kitchen_addresses_staging
            SET ${fields.join(', ')}, updated_at = NOW()
          WHERE kitchen_address_id = $${idx}
          RETURNING *`,
        values
      );

      if (!updatedRows.length) {
        log.error({ kitchenId, addressId }, '[editKitchenAddress] Staging address not found');
        throw new BusinessError('KITCHEN.STAGE_ADDRESS_NOT_FOUND', { traceId: req.traceId });
      }

      await client.query('COMMIT');
      log.info({ kitchenId, addressId }, '[editKitchenAddress] Staging address updated and transaction committed');
      return sendSuccess(res, 'KITCHEN.ADDRESS_UPDATED', updatedRows[0], req.traceId);
    }

    // 3️⃣ If approved or other status → create change_request
    log.info({ kitchenId, addressId }, '[editKitchenAddress] Kitchen not draft, creating change request');
    const workflowId = 'BACKEND_APPROVAL';

    const { rows: changeRequestRows } = await client.query(
      `INSERT INTO change_requests
      (entity_name, entity_id, sub_entity_name, sub_entity_id, action, status, requested_by, requested_by_role, workflow_id, created_at, updated_at)
    VALUES ($1,$2,$3,$4,$5,'INITIATED',$6,$7,$8,NOW(),NOW())
    RETURNING *;`,
      [
        'kitchens',
        kitchenId,
        'kitchen_addresses',
        addressId,
        'KITCHEN_ADDRESS_UPDATED',
        adminUserId,
        'BACKEND',
        workflowId
      ]
    );

    await client.query('COMMIT');
    log.info({ kitchenId, addressId, changeRequestId: changeRequestRows[0].id }, '[editKitchenAddress] Change request created and transaction committed');
    return sendSuccess(res, 'REQUEST.CREATED', changeRequestRows[0], req.traceId);

  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    log.error({ err }, '[editKitchenAddress] Transaction rolled back due to error');
    return next(err);
  } finally {
    if (client) client.release();
    log.debug({}, '[editKitchenAddress] DB client released');
  }
};
