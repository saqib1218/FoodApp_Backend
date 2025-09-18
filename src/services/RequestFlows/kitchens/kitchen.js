const { pool } = require('../../../config/database');
const logger = require('../../../config/logger');
const BusinessError = require('../../../lib/businessErrors');

/**
 * Sync a kitchen from staging to main table
 */
exports.syncKitchenFromStaging = async (entityId, traceId) => {
  const log = logger.withTrace({ traceId });
  let client;

  try {
    if (!entityId) {
      throw new BusinessError('COMMON.MISSING_REQUIRED_FIELDS', {
        traceId,
        details: { fields: [{ field: 'kitchenId', meta: { reason: 'required' } }] }
      });
    }

    client = await pool.connect();
    await client.query('BEGIN');

    // Fetch staging record by kitchen_id (use entityId)
    const { rows: stagingRows } = await client.query(
      `SELECT name, tagline, bio, is_logo_available
       FROM kitchens_staging
       WHERE kitchen_id = $1`,
      [entityId]  // <-- was incorrectly using kitchenId
    );

    if (!stagingRows.length) {
      throw new BusinessError('KITCHEN.NOT_FOUND', { traceId });
    }

    const staging = stagingRows[0];

    // Update main kitchens table
    await client.query(
      `UPDATE kitchens
       SET name=$1, tagline=$2, bio=$3, is_logo_available=$4, updated_at=NOW()
       WHERE id=$5`,
      [staging.name, staging.tagline, staging.bio, staging.is_logo_available, entityId] // also use entityId
    );

    await client.query('COMMIT');
    log.info({ kitchenId: entityId }, '[syncKitchenFromStaging] ✅ Kitchens table synced');

    return staging;
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    throw err instanceof BusinessError
      ? err
      : new BusinessError('KITCHEN.SYNC_KITCHEN_DATA_FAILED', { traceId });
  } finally {
    if (client) client.release();
  }
};


/**
 * Approve a full kitchen including addresses and availability
 */
exports.approveFullKitchen = async (entityId, traceId) => {
  const log = logger.withTrace({ traceId });
  let client;

  try {
    if (!entityId) {
      throw new BusinessError('COMMON.MISSING_REQUIRED_FIELDS', {
        traceId,
        details: [{ field: 'kitchenId', meta: { reason: 'required' } }]
      });
    }

    client = await pool.connect();
    await client.query('BEGIN');

    // Fetch kitchen staging record
    log.info({ entityId }, 'Fetching kitchen staging record');
    const { rows: kitchenRows } = await client.query(
      `SELECT * FROM kitchens_staging WHERE kitchen_id = $1`,
      [entityId]
    );

    if (!kitchenRows.length) {
      log.error({ entityId }, 'Kitchen staging record not found');
      throw new BusinessError('KITCHEN.NOT_FOUND', { traceId });
    }

    const kitchenStaging = kitchenRows[0];
    const stagingId = kitchenStaging.id;
    log.info({ kitchenStaging }, 'Kitchen staging record fetched');

    // Update kitchens table
    log.info('Updating kitchens table');
    await client.query(
      `UPDATE kitchens
       SET name=$1, tagline=$2, bio=$3, is_logo_available=$4, status='approved', updated_at=NOW()
       WHERE id=$5`,
      [kitchenStaging.name, kitchenStaging.tagline, kitchenStaging.bio, kitchenStaging.is_logo_available, entityId]
    );

    // Sync kitchen addresses
    log.info('Fetching kitchen addresses from staging');
    const { rows: addressRows } = await client.query(
      `SELECT * FROM kitchen_addresses_staging WHERE kitchen_staging_id = $1`,
      [stagingId]
    );

    if (addressRows.length) {
      log.info({ addressRows }, 'Kitchen addresses found, inserting...');
      for (const addr of addressRows) {
        await client.query(
          `INSERT INTO kitchen_addresses
           (kitchen_id, address_line1, address_line2, city, state, country, postal_code, status, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'ACTIVE',NOW(),NOW())`,
          [entityId, addr.address_line1, addr.address_line2, addr.city, addr.state, addr.country, addr.postal_code]
        );
      }
    } else {
      log.warn({ stagingId }, 'No kitchen addresses found in staging');
    }

    // Sync kitchen availability
    log.info('Fetching kitchen availability from staging');
    const { rows: availabilityRows } = await client.query(
      `SELECT * FROM kitchen_availability_staging WHERE kitchen_staging_id = $1`,
      [stagingId]
    );

    if (availabilityRows.length) {
      log.info({ availabilityRows }, 'Kitchen availability found, inserting...');
      for (const av of availabilityRows) {
        await client.query(
          `INSERT INTO kitchen_availability
           (kitchen_id, day_of_week_id, slot_id, is_available, custom_start_time, custom_end_time, status, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,'approved',NOW(),NOW())`,
          [entityId, av.day_of_week_id, av.slot_id, true, av.custom_start_time, av.custom_end_time]
        );
      }
    } else {
      log.warn({ stagingId }, 'No kitchen availability found in staging');
    }

    await client.query('COMMIT');
    log.info({ entityId }, '[approveFullKitchen] ✅ Full kitchen approval completed');

    return kitchenStaging;

  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    log.error({ err }, '[approveFullKitchen] ❌ Error occurred');
    throw err instanceof BusinessError
      ? err
      : new BusinessError('REQUEST.FAILED', { traceId });
  } finally {
    if (client) client.release();
  }
};



