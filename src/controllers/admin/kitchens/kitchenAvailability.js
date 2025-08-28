const { pool } = require('../../../config/database');
const BusinessError = require('../../../lib/businessErrors');
const { sendSuccess } = require('../../../utils/responseHelpers');
const { hasAdminPermissions } = require('../../../services/hasAdminPermissions');
const PERMISSIONS=require('../../../config/permissions')
/**
 * Update Kitchen Availability (Admin -> goes into staging + main reference)
 * PUT /kitchen/:kitchenId/availability
 */
exports.updateKitchenAvailability = async (req, res, next) => {
  const { kitchenId } = req.params;
  const { availability, ownerUserId } = req.body;
  const adminUserId = req.user?.userId; // ✅ admin ID from token
  const traceId = req.trace_id;

  console.log('🔹 Incoming request to update kitchen availability');
  console.log('🔹 kitchenId:', kitchenId, 'adminUserId:', adminUserId, 'ownerUserId:', ownerUserId);
  console.log('🔹 Request body:', JSON.stringify(req.body, null, 2));

  if (!Array.isArray(availability) || availability.length === 0) {
    return next(
      new BusinessError('MISSING_REQUIRED_FIELDS', { traceId, details: ['availability'] })
    );
  }

  if (!ownerUserId) {
    return next(
      new BusinessError('MISSING_REQUIRED_FIELDS', { traceId, details: ['ownerUserId'] })
    );
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

     await hasAdminPermissions(userId, PERMISSIONS.ADMIN.KITCHEN.AVAILABILITY);

    // 2️⃣ Verify kitchen belongs to this owner
    const kitchenCheck = await client.query(
      `SELECT ku.id 
       FROM kitchen_users ku
       WHERE ku.user_id = $1 AND ku.kitchen_id = $2 AND ku.deleted_at IS NULL`,
      [ownerUserId, kitchenId]
    );

    if (kitchenCheck.rowCount === 0) {
      throw new BusinessError('INVALID_KITCHEN_OWNER_RELATION', { traceId });
    }

    // 3️⃣ Insert availability (main + staging)
    for (const slot of availability) {
      const {
        day_of_week,
        slot_id,
        is_available,
        custom_start_time,
        custom_end_time
      } = slot;

      // Insert into MAIN table first
      const mainResult = await client.query(
        `INSERT INTO kitchen_availability 
         (kitchen_id, day_of_week_id, slot_id, is_available, custom_start_time, custom_end_time, created_by, updated_by, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())
         RETURNING id`,
        [
          kitchenId,
          day_of_week,
          slot_id,
          is_available || false,
          custom_start_time || null,
          custom_end_time || null,
          adminUserId,
          adminUserId
        ]
      );

      const mainAvailabilityId = mainResult.rows[0].id;

      // Insert into STAGING table referencing main availability
      await client.query(
        `INSERT INTO kitchen_availability_staging 
         (kitchen_availability_id, kitchen_id, day_of_week_id, slot_id, is_available, custom_start_time, custom_end_time, created_by, updated_by, created_at, updated_at, owner_user_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW(),$10)`,
        [
          mainAvailabilityId,
          kitchenId,
          day_of_week,
          slot_id,
          is_available || false,
          custom_start_time || null,
          custom_end_time || null,
          adminUserId,
          adminUserId,
          ownerUserId
        ]
      );
    }

    await client.query('COMMIT');

    console.log('✅ Kitchen availability updated successfully (main + staging)');
    return sendSuccess(res, 'KITCHEN_AVAILABILITY_UPDATED', {}, traceId);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error updating kitchen availability:', err);
    return next(err);
  } finally {
    client.release();
  }
};
