const { pool } = require('../../../config/database');
const { sendSuccess } = require('../../../utils/responseHelpers');
const logger = require('../../../config/logger');
const BusinessError = require('../../../lib/businessErrors');

exports.syncKitchenAddressesFromStaging = async (entityId, subEntityId, traceId) => {
  const log = logger.withTrace({ traceId });
  let client;

  try {
    client = await pool.connect();
    await client.query('BEGIN');

    // 1️⃣ Fetch the staging record by kitchen_address_id (subEntityId)
    const { rows: stagingRows } = await client.query(
      `SELECT id, kitchen_address_id, kitchen_staging_id, address_name, address_line1, address_line2,
              city, state, zone, postal_code, country, nearest_location, delivery_instruction,
              latitude, longitude, place_id, formatted_address, map_link
       FROM kitchen_addresses_staging
       WHERE kitchen_address_id = $1
         AND deleted_at IS NULL`,
      [subEntityId]
    );

    if (!stagingRows.length) {
      throw new BusinessError('KITCHEN.STAGE_ADDRESS_NOT_FOUND', {
        traceId,
        details: { kitchenAddressId: subEntityId }
      });
    }

    const staging = stagingRows[0];
    const kitchenAddressStagingId = staging.id;

    // 2️⃣ Mark any existing active addresses for this kitchen as inactive
    await client.query(
      `UPDATE kitchen_addresses
       SET status='INACTIVE', updated_at=NOW()
       WHERE kitchen_id = $1 AND status='ACTIVE'`,
      [entityId]
    );

    // 3️⃣ Sync staging → main (always set this one to active)
    const { rows: result } = await client.query(
      `INSERT INTO kitchen_addresses (
          id, kitchen_id, address_name, address_line1, address_line2, city, state, zone,
          postal_code, country, nearest_location, delivery_instruction,
          latitude, longitude, place_id, formatted_address, map_link,
          status, created_at, updated_at
      )
      VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
          'ACTIVE', NOW(), NOW()
      )
      ON CONFLICT (id)
      DO UPDATE SET
          address_name        = EXCLUDED.address_name,
          address_line1       = EXCLUDED.address_line1,
          address_line2       = EXCLUDED.address_line2,
          city                = EXCLUDED.city,
          state               = EXCLUDED.state,
          zone                = EXCLUDED.zone,
          postal_code         = EXCLUDED.postal_code,
          country             = EXCLUDED.country,
          nearest_location    = EXCLUDED.nearest_location,
          delivery_instruction= EXCLUDED.delivery_instruction,
          latitude            = EXCLUDED.latitude,
          longitude           = EXCLUDED.longitude,
          place_id            = EXCLUDED.place_id,
          formatted_address   = EXCLUDED.formatted_address,
          map_link            = EXCLUDED.map_link,
          status              = 'ACTIVE',
          updated_at          = NOW()
      RETURNING *`,
      [
        staging.kitchen_address_id, // main kitchen_address.id
        entityId,                   // main kitchen_id
        staging.address_name,
        staging.address_line1,
        staging.address_line2,
        staging.city,
        staging.state,
        staging.zone,
        staging.postal_code,
        staging.country,
        staging.nearest_location,
        staging.delivery_instruction,
        staging.latitude,
        staging.longitude,
        staging.place_id,
        staging.formatted_address,
        staging.map_link
      ]
    );

    await client.query('COMMIT');

    log.info(
      { entityId, subEntityId, kitchenAddressStagingId },
      '[syncKitchenAddressesFromStaging] ✅ Address synced and set to active'
    );

    return { ...result[0], kitchen_address_staging_id: kitchenAddressStagingId };

  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    if (client) client.release();
  }
};
