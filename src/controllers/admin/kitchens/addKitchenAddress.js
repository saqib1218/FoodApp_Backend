const { pool } = require('../../../config/database');
const BusinessError = require('../../../lib/businessErrors');
const { sendSuccess } = require('../../../utils/responseHelpers');
const { hasPermission } = require('../../../services/permissionService');

/**
 * Add Kitchen Address
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
    map_link
  } = req.body;

  const { userId } = req.user; // from auth middleware
  const traceId = req.traceId;  // consistent trace ID

  console.log('🔹 Incoming request to add kitchen address');
  console.log('🔹 userId:', userId, 'kitchenId:', kitchenId);
  console.log('🔹 Request body:', req.body);

  // ✅ Validate required fields
  if (!address_line1 || !city || !country) {
    return next(new BusinessError('MISSING_REQUIRED_FIELDS', {
      traceId,
      details: ['address_line1', 'city', 'country']
    }));
  }

  try {
    // ✅ Verify user belongs to a kitchen
    let kitchenCheckQuery = `
      SELECT kitchen_id
      FROM kitchen_users
      WHERE id = $1
        AND deleted_at IS NULL
    `;
    const kitchenCheckParams = [userId];

    const kitchenCheck = await pool.query(kitchenCheckQuery, kitchenCheckParams);

    if (kitchenCheck.rowCount === 0) {
      console.warn('❌ User does not belong to any kitchen');
      return next(new BusinessError('USER_NOT_AUTHORIZED', { traceId }));
    }

    // If kitchenId is passed in params, verify user has access
    if (kitchenId && !kitchenCheck.rows.some(r => r.kitchen_id === kitchenId)) {
      console.warn('❌ User does not belong to this kitchenId:', kitchenId);
      return next(new BusinessError('USER_NOT_AUTHORIZED', { traceId }));
    }

    // If kitchenId is missing in params, use the first kitchen assigned
    if (!kitchenId) {
      kitchenId = kitchenCheck.rows[0].kitchen_id;
      console.log('🔹 Using user\'s first kitchenId:', kitchenId);
    }

    // ✅ Check permission for creating an address
    console.log('🔹 Checking permission for kitchen.address.create');
    const allowed = await hasPermission(userId, 'kitchen.address.create');
    console.log('🔹 Permission result:', allowed);

    if (!allowed) {
      return next(new BusinessError('USER_NOT_AUTHORIZED', { traceId }));
    }

    // ✅ Insert new kitchen address
    const result = await pool.query(
      `INSERT INTO kitchen_addresses 
       (kitchen_id, address_name, address_line1, address_line2, city, state, zone, postal_code, country, nearest_location, delivery_instruction, status, latitude, longitude, place_id, formatted_address, map_link, created_by, updated_by, created_at, updated_at)
       VALUES
       ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,NOW(),NOW())
       RETURNING *`,
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
        userId,
        userId
      ]
    );

    // ✅ Return success
    return sendSuccess(res, 'KITCHEN_ADDRESS_CREATED', result.rows[0], traceId);

  } catch (err) {
    console.error('❌ Error adding kitchen address:', err);
    return next(err);
  }
};
