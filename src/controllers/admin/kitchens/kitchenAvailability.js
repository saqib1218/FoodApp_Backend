const { pool } = require('../../../config/database');

const { sendSuccess } = require('../../../utils/responseHelpers');
const logger = require('../../../config/logger');
const { hasAdminPermissions } = require('../../../services/hasAdminPermissions');
const PERMISSIONS = require('../../../config/permissions');
const BusinessError = require('../../../lib/businessErrors');

exports.updateKitchenAvailability = async (req, res, next) => {
  const { kitchenId } = req.params.id;
  const availabilities = req.body.availabilities; // [{dayOfWeek, slotId, isAvailable, customStartTime, customEndTime}]
  const adminUserId = req.user?.userId;
  const log = logger.withTrace(req);
 await hasAdminPermissions(adminUserId, PERMISSIONS.ADMIN.KITCHEN.AVAILABILITY);
  try {
    log.info({ kitchenId, adminUserId }, '[updateKitchenAvailability] request started');

    // 1️⃣ Check kitchenId
    if (!kitchenId) {
      throw new BusinessError('COMMON.MISSING_REQUIRED_FIELDS', {
        traceId: req.traceId,
        details: {
          fields: [{ field: 'kitchenId', meta: { reason: 'required' } }],
          meta: {}
        }
      });
    }

    // 2️⃣ Check availabilities array
    if (!Array.isArray(availabilities) || !availabilities.length) {
      throw new BusinessError('COMMON.MISSING_REQUIRED_FIELDS', {
        traceId: req.traceId,
        details: {
          fields: [{ field: 'availabilities', meta: { reason: 'required' } }],
          meta: {}
        }
      });
    }

    // 3️⃣ Check each slot for required fields
    const missingFields = [];
    availabilities.forEach((slot, index) => {
      if (!slot.dayOfWeek) missingFields.push({ field: `availabilities[${index}].dayOfWeek`, meta: { reason: 'required' } });
      if (!slot.slotId) missingFields.push({ field: `availabilities[${index}].slotId`, meta: { reason: 'required' } });
    });

    if (missingFields.length) {
      throw new BusinessError('COMMON.MISSING_REQUIRED_FIELDS', {
        traceId: req.traceId,
        details: { fields: missingFields, meta: {} }
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get kitchen_staging_id
      const { rows: stagingRows } = await client.query(
        `SELECT id AS kitchen_staging_id FROM kitchens_staging WHERE kitchen_id=$1 LIMIT 1`,
        [kitchenId]
      );
      if (!stagingRows.length) throw new BusinessError('KITCHEN.KITCHEN_NOT_FOUND');
      const kitchenStagingId = stagingRows[0].kitchen_staging_id;

      const updatedSlots = [];

      for (const slot of availabilities) {
        const { dayOfWeek, slotId, isAvailable, customStartTime, customEndTime } = slot;
        if (!dayOfWeek || !slotId) continue;

        // 1️⃣ Create a **main record placeholder per slot** (all null except kitchen_id)
        const { rows: insertedMain } = await client.query(
          `INSERT INTO kitchen_availability
           (kitchen_id, is_available, status, created_at, updated_at)
           VALUES ($1, false, 'draft', NOW(), NOW())
           RETURNING id`,
          [kitchenId]
        );
        const mainSlotId = insertedMain[0].id;

        // 2️⃣ Insert/update staging record with actual values
        const { rows: existingStaging } = await client.query(
          `SELECT id FROM kitchen_availability_staging
           WHERE kitchen_staging_id=$1 AND day_of_week_id=$2 AND slot_id=$3`,
          [kitchenStagingId, dayOfWeek, slotId]
        );

        let updatedSlot;
        if (existingStaging.length) {
          const { rows: updatedRows } = await client.query(
            `UPDATE kitchen_availability_staging
             SET kitchen_availability_id=$1, is_available=$2, custom_start_time=$3, custom_end_time=$4, status='draft', updated_at=NOW()
             WHERE id=$5 RETURNING *`,
            [mainSlotId, isAvailable ?? false, customStartTime || null, customEndTime || null, existingStaging[0].id]
          );
          updatedSlot = updatedRows[0];
        } else {
          const { rows: insertedRows } = await client.query(
            `INSERT INTO kitchen_availability_staging
             (kitchen_availability_id, kitchen_staging_id, day_of_week_id, slot_id, is_available, custom_start_time, custom_end_time, status, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,'draft',NOW()) RETURNING *`,
            [mainSlotId, kitchenStagingId, dayOfWeek, slotId, isAvailable ?? false, customStartTime || null, customEndTime || null]
          );
          updatedSlot = insertedRows[0];
        }

        updatedSlots.push(updatedSlot);
      }

     

      await client.query('COMMIT');
      log.info({ kitchenId }, '✅ Kitchen availability updated');

      return sendSuccess(res, 'KITCHEN.KITCHEN_AVAILABILITY_UPDATED', updatedSlots, req.traceId);
    } catch (err) {
      await client.query('ROLLBACK');
      return next(err);
    } finally {
      client.release();
    }
  } catch (err) {
    return next(err);
  }
};
