const { pool } = require('../../../config/database');
const BusinessError = require('../../../lib/businessErrors');
const { sendSuccess } = require('../../../utils/responseHelpers');
const { hasAdminPermissions } = require('../../../services/hasAdminPermissions');
const PERMISSIONS = require('../../../config/permissions');
/**
 * Add Kitchen Address (Admin → goes into staging + main reference)
 * POST /kitchen/:kitchenId/addresses
 */
exports.addKitchenAddress = async (req, res, next) => {
  let { kitchenId } = req.params;
  const {
    address_name,
    address_line1,
    address_line2,
    city,
    state,
    zone,
    postal_code,
    country,
    nearest_location,
    delivery_instruction,
    status = true,
    latitude,
    longitude,
    place_id,
    formatted_address,
    map_link,
    ownerUserId
  } = req.body;

  const adminUserId = req.user?.userId; // ✅ Admin from token
  const traceId = req.trace_id;

  console.log('🔹 Incoming request to add kitchen address');
  console.log('🔹 adminUserId:', adminUserId, 'ownerUserId:', ownerUserId, 'kitchenId:', kitchenId);
  console.log('🔹 Request body:', req.body);

  // ✅ Validate required fields
  if (!address_line1 || !city || !country) {
    return next(new BusinessError('MISSING_REQUIRED_FIELDS', {
      traceId,
      details: ['address_line1', 'city', 'country']
    }));
  }

  if (!ownerUserId) {
    return next(new BusinessError('MISSING_REQUIRED_FIELDS', {
      traceId,
      details: ['ownerUserId']
    }));
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await hasAdminPermissions(userId, PERMISSIONS.ADMIN.KITCHEN.ADD_ADDRESS);

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

    // 3️⃣ Insert into MAIN table
    const mainResult = await client.query(
      `INSERT INTO kitchen_addresses 
       (kitchen_id, address_name, address_line1, address_line2, city, state, zone, postal_code, country, nearest_location, delivery_instruction, status, latitude, longitude, place_id, formatted_address, map_link, created_by, updated_by, created_at, updated_at)
       VALUES
       ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,NOW(),NOW())
       RETURNING id`,
      [
        kitchenId,
        address_name || null,
        address_line1,
        address_line2 || null,
        city,
        state || null,
        zone || null,
        postal_code || null,
        country,
        nearest_location || null,
        delivery_instruction || null,
        status,
        latitude || null,
        longitude || null,
        place_id || null,
        formatted_address || null,
        map_link || null,
        adminUserId,
        adminUserId
      ]
    );

    const mainAddressId = mainResult.rows[0].id;

    // 4️⃣ Insert into STAGING table
    await client.query(
      `INSERT INTO kitchen_addresses_staging
       (kitchen_address_id, kitchen_id, address_name, address_line1, address_line2, city, state, zone, postal_code, country, nearest_location, delivery_instruction, status, latitude, longitude, place_id, formatted_address, map_link, created_by, updated_by, created_at, updated_at, owner_user_id)
       VALUES
       ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,NOW(),NOW(),$21)`,
      [
        mainAddressId,
        kitchenId,
        address_name || null,
        address_line1,
        address_line2 || null,
        city,
        state || null,
        zone || null,
        postal_code || null,
        country,
        nearest_location || null,
        delivery_instruction || null,
        status,
        latitude || null,
        longitude || null,
        place_id || null,
        formatted_address || null,
        map_link || null,
        adminUserId,
        adminUserId,
        ownerUserId
      ]
    );

    await client.query('COMMIT');

    console.log('✅ Kitchen address created successfully (main + staging)');
    return sendSuccess(res, 'KITCHEN_ADDRESS_CREATED', { id: mainAddressId }, traceId);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error adding kitchen address:', err);
    return next(err);
  } finally {
    client.release();
  }
};
