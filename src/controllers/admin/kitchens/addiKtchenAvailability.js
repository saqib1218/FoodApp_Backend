const { pool } = require('../../../config/database');
const { sendSuccess } = require('../../../utils/responseHelpers');
const logger = require('../../../config/logger');
const { hasAdminPermissions } = require('../../../services/hasAdminPermissions');
const PERMISSIONS = require('../../../config/permissions');
const BusinessError = require('../../../lib/businessErrors');

exports.updateKitchenAvailability = async (req, res, next) => {
  const kitchenId = req.params.kitchenId;
  const availabilities = req.body.availabilities; 
  const adminUserId = req.user?.userId;
  const log = logger.withTrace(req);

  await hasAdminPermissions(adminUserId, PERMISSIONS.ADMIN.KITCHEN.AVAILABILITY);

  let client;

  try {
    log.info({ kitchenId, adminUserId }, '[updateKitchenAvailability] request started');
     

    // 1️⃣ Validate kitchenId
    if (!kitchenId) {
      throw new BusinessError('COMMON.MISSING_REQUIRED_FIELDS', {
        traceId: req.traceId,
        details: { fields: [{ field: 'kitchenId', meta: { reason: 'required' } }], meta: {} }
      });
    }

    // 2️⃣ Validate availabilities
    if (!Array.isArray(availabilities) || !availabilities.length) {
      throw new BusinessError('COMMON.MISSING_REQUIRED_FIELDS', {
        traceId: req.traceId,
        details: { fields: [{ field: 'availabilities', meta: { reason: 'required' } }], meta: {} }
      });
    }

    // 3️⃣ Validate fields per slot
    const missingFields = [];
    availabilities.forEach((slot, i) => {
      if (!slot.dayOfWeek) missingFields.push({ field: `availabilities[${i}].dayOfWeek`, meta: { reason: 'required' } });
      if (!slot.slotId) missingFields.push({ field: `availabilities[${i}].slotId`, meta: { reason: 'required' } });
    });
    if (missingFields.length) {
      throw new BusinessError('COMMON.MISSING_REQUIRED_FIELDS', { traceId: req.traceId, details: { fields: missingFields, meta: {} } });
    }

    client = await pool.connect();
    await client.query('BEGIN');

    // 4️⃣ Get kitchen status
    const { rows: kitchenRows } = await client.query(`SELECT status FROM kitchens WHERE id=$1`, [kitchenId]);
    if (!kitchenRows.length) throw new BusinessError('KITCHEN.NOT_FOUND');
    const kitchenStatus = kitchenRows[0].status;

    if (kitchenStatus === 'SUBMITTED') {
      throw new BusinessError('KITCHEN.UPDATE_NOT_ALLOWED', { traceId: req.traceId });
    }

    // 5️⃣ Always get staging kitchen
    const { rows: stagingKitchen } = await client.query(
      `SELECT id AS kitchen_staging_id FROM kitchens_staging WHERE kitchen_id=$1 LIMIT 1`,
      [kitchenId]
    );
    if (!stagingKitchen.length) throw new BusinessError('KITCHEN.KITCHEN_NOT_FOUND');
    const kitchenStagingId = stagingKitchen[0].kitchen_staging_id;

    let changeRequestRow = null;
    // 6️⃣ Non-draft → create change_request
    if (kitchenStatus !== 'DRAFT') {
      const { rows: cr } = await client.query(
        `INSERT INTO change_requests
           (entity_name, entity_id, sub_entity_name, action, status, requested_by, requested_by_role, workflow_id, created_at, updated_at)
         VALUES ('kitchens',$1,'kitchen_availability','KITCHEN_AVAILABILITY_UPDATED','INITIATED',$2,'BACKEND','BACKEND_APPROVAL',NOW(),NOW())
         RETURNING *`,
        [kitchenId, adminUserId]
      );
      changeRequestRow = cr[0];
    }

    // 7️⃣ Upsert into staging (common for both cases)
    const updatedSlots = [];

    for (const slot of availabilities) {
      const { dayOfWeek, slotId, customStartTime, customEndTime, isAvailable } = slot;
      if (!dayOfWeek || !slotId) continue;

      // ✅ Check if main record exists
      let kitchenAvailabilityId = null;
      const { rows: mainRows } = await client.query(
        `SELECT id FROM kitchen_availability
         WHERE kitchen_id=$1 AND day_of_week_id=$2 AND slot_id=$3`,
        [kitchenId, dayOfWeek, slotId]
      );

      // 1️⃣ If CREATE → insert placeholder row with actual values
      if (!mainRows.length) {
        const { rows: insMain } = await client.query(
          `INSERT INTO kitchen_availability
           (kitchen_id, day_of_week_id, slot_id, is_available, status,
            custom_start_time, custom_end_time, created_at, updated_at)
           VALUES ($1,$2,$3,$4,'DRAFT',$5,$6,NOW(),NOW())
           RETURNING id`,
          [kitchenId, dayOfWeek, slotId, isAvailable ?? false, customStartTime || null, customEndTime || null]
        );
        kitchenAvailabilityId = insMain[0].id;
      } else {
        kitchenAvailabilityId = mainRows[0].id;
      }

      // 2️⃣ Staging upsert → always use actual request values
      const { rows: existing } = await client.query(
        `SELECT id FROM kitchen_availability_staging
         WHERE kitchen_staging_id=$1 AND day_of_week_id=$2 AND slot_id=$3`,
        [kitchenStagingId, dayOfWeek, slotId]
      );

      let updatedSlot;
      if (existing.length) {
        const { rows: upd } = await client.query(
          `UPDATE kitchen_availability_staging
             SET kitchen_availability_id=$1,
                 is_available=$2,
                 custom_start_time=$3,
                 custom_end_time=$4,
                 status='DRAFT',
                 updated_at=NOW()
           WHERE id=$5
           RETURNING *`,
          [kitchenAvailabilityId, isAvailable ?? false, customStartTime || null, customEndTime || null, existing[0].id]
        );
        updatedSlot = upd[0];
      } else {
        const { rows: ins } = await client.query(
          `INSERT INTO kitchen_availability_staging
             (kitchen_staging_id, kitchen_availability_id, day_of_week_id, slot_id,
              is_available, custom_start_time, custom_end_time, status, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'DRAFT',NOW(),NOW())
           RETURNING *`,
          [kitchenStagingId, kitchenAvailabilityId, dayOfWeek, slotId, isAvailable ?? false, customStartTime || null, customEndTime || null]
        );
        updatedSlot = ins[0];
      }

      updatedSlots.push(updatedSlot);
    }

    await client.query('COMMIT');
    log.info({ kitchenId }, '✅ Kitchen availability updated with staging upsert');

    // 8️⃣ Response
    if (kitchenStatus === 'DRAFT') {
      return sendSuccess(res, 'KITCHEN.AVAILABILITY_UPDATED', updatedSlots, req.traceId);
    } else {
      return sendSuccess(res, 'REQUEST.CREATED', { changeRequest: changeRequestRow, staging: updatedSlots }, req.traceId);
    }

  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    return next(err);
  } finally {
    if (client) client.release();
  }
};
