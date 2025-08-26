const { pool } = require('../../../config/database');
const BusinessError = require('../../../lib/businessErrors');
const { sendSuccess } = require('../../../utils/responseHelpers');
const { hasPermission } = require('../../../services/permissionService');

/**
 * Update Kitchen Availability
 * PUT /kitchen/:kitchenId/availability
 */
exports.updateKitchenAvailability = async (req, res, next) => {
  const { kitchenId } = req.params;
  const { availability } = req.body; // array of slots
  const { userId } = req.user; // global user ID from auth middleware
  const traceId = req.trace_id;

  console.log('🔹 Incoming request to update kitchen availability');
  console.log('🔹 kitchenId:', kitchenId, 'userId:', userId);
  console.log('🔹 Request body:', JSON.stringify(req.body, null, 2));

  if (!Array.isArray(availability) || !availability.length) {
    return next(
      new BusinessError('MISSING_REQUIRED_FIELDS', {
        traceId,
        details: ['availability']
      })
    );
  }

  try {
    // ✅ Check permission
    const allowed = await hasPermission(userId, 'kitchen.availability.update');
    console.log('🔹 Permission allowed:', allowed);

    if (!allowed) {
      return next(new BusinessError('USER_NOT_AUTHORIZED', { traceId }));
    }

// Check if the user belongs to this kitchen
const kitchenCheck = await pool.query(
  `SELECT id FROM kitchen_users WHERE id = $1 AND kitchen_id = $2 AND deleted_at IS NULL`,
  [userId, kitchenId]
);



    console.log('🔹 kitchenCheck.rowCount:', kitchenCheck.rowCount);

    if (kitchenCheck.rowCount === 0) {
      return next(new BusinessError('USER_NOT_AUTHORIZED', { traceId }));
    }

    // ✅ Delete previous availability for this kitchen
    await pool.query(`DELETE FROM kitchen_availability WHERE kitchen_id = $1`, [kitchenId]);

    // ✅ Insert new availability
    for (const slot of availability) {
      const { day_of_week, slot_id, is_available, custom_start_time, custom_end_time } = slot;

      await pool.query(
        `INSERT INTO kitchen_availability 
         (kitchen_id, day_of_week_id, slot_id, is_available, custom_start_time, custom_end_time, created_by, updated_by, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())`,
        [
          kitchenId,
          day_of_week,
          slot_id,
          is_available || false,
          custom_start_time || null,
          custom_end_time || null,
          userId,
          userId
        ]
      );
    }

    console.log('✅ Kitchen availability updated successfully');
    return sendSuccess(res, 'KITCHEN_AVAILABILITY_UPDATED', {}, traceId);

  } catch (err) {
    console.error('❌ Error updating kitchen availability:', err);
    return next(err);
  }
};
