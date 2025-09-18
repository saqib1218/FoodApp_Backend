const { pool } = require('../../../config/database');
const logger = require('../../../config/logger');
const BusinessError = require('../../../lib/businessErrors');

exports.syncKitchenAvailabilityFromStaging = async (entityId, logTrace) => {
  const client = await pool.connect();
  const log = logger.withTrace(logTrace);

  try {
    await client.query('BEGIN');

    // 1️⃣ Resolve kitchen_staging → kitchen
    const { rows: kitchenRow } = await client.query(
      `SELECT id, kitchen_id 
         FROM kitchens_staging 
        WHERE kitchen_id = $1`,
      [entityId]
    );
    if (!kitchenRow.length) {
      throw new BusinessError('KITCHEN_NOT_FOUND', 404, 'Kitchen staging not found');
    }
    const kitchenStagingId = kitchenRow[0].id;
    const kitchenId = kitchenRow[0].kitchen_id;

    // 2️⃣ Fetch staging availability
    const { rows: stagingRows } = await client.query(
      `SELECT id, day_of_week_id, slot_id, is_available, custom_start_time, custom_end_time
         FROM kitchen_availability_staging
        WHERE kitchen_staging_id = $1`,
      [kitchenStagingId]
    );

    if (!stagingRows.length) {
      throw new BusinessError('NO_AVAILABILITY', 400, 'No staging availability found');
    }

    // 3️⃣ Sync each row into main
    for (const row of stagingRows) {
      // Check if record already exists in main
      const { rows: existing } = await client.query(
        `SELECT id FROM kitchen_availability
          WHERE kitchen_id = $1 AND day_of_week_id = $2 AND slot_id = $3`,
        [kitchenId, row.day_of_week_id, row.slot_id]
      );

      let mainId;
      if (existing.length) {
        // 🔄 Update existing record
        const { rows: [updated] } = await client.query(
          `UPDATE kitchen_availability
              SET is_available = $1,
                  custom_start_time = $2,
                  custom_end_time = $3,
                  status = 'APPROVED',
                  updated_at = NOW()
            WHERE id = $4
            RETURNING id`,
          [row.is_available, row.custom_start_time, row.custom_end_time, existing[0].id]
        );
        mainId = updated.id;
      } else {
        // ➕ Insert new record
        const { rows: [inserted] } = await client.query(
          `INSERT INTO kitchen_availability
             (kitchen_id, day_of_week_id, slot_id, is_available, custom_start_time, custom_end_time, status, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,'APPROVED',NOW(),NOW())
           RETURNING id`,
          [kitchenId, row.day_of_week_id, row.slot_id, row.is_available, row.custom_start_time, row.custom_end_time]
        );
        mainId = inserted.id;
      }

      // 4️⃣ Update staging FK → main record
      await client.query(
        `UPDATE kitchen_availability_staging 
            SET kitchen_availability_id = $1, status = 'APPROVED', updated_at = NOW()
          WHERE id = $2`,
        [mainId, row.id]
      );
    }

    await client.query('COMMIT');
    log.info({ entityId }, '[syncKitchenAvailabilityFromStaging] ✅ Kitchen availability synced successfully');
    return { success: true, message: 'Kitchen availability synced successfully' };

  } catch (err) {
    await client.query('ROLLBACK');
    log.error({ err, entityId }, '[syncKitchenAvailabilityFromStaging] ❌ Error syncing kitchen availability');
    throw err instanceof BusinessError
      ? err
      : new BusinessError('UNKNOWN_ERROR', 500, 'An unexpected error occurred.');
  } finally {
    client.release();
  }
};
