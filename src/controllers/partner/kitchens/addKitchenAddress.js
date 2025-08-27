const { pool } = require('../../../config/database');
const BusinessError = require('../../../lib/businessErrors');
const { sendSuccess } = require('../../../utils/responseHelpers');
const { hasPermission } = require('../../../services/permissionService');

/**
 * Add Kitchen Address (Staging)
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
    ownerUserId // pass owner id in body
  } = req.body;

  const adminUserId = req.user?.userId; // admin performing action
  const traceId = req.traceId;

  if (!adminUserId) {
    return next(new BusinessError('USER_NOT_AUTHORIZED', { traceId }));
  }

  if (!address_line1 || !city || !country || !ownerUserId) {
    return next(new BusinessError('MISSING_REQUIRED_FIELDS', {
      traceId,
      details: ['address_line1', 'city', 'country', 'ownerUserId']
    }));
  }

  try {
    await pool.query('BEGIN');

    // ✅ Insert minimal placeholder in kitchen_addresses
    const placeholderResult = await pool.query(
      `INSERT INTO kitchen_addresses
       (kitchen_id, status, created_by, updated_by, created_at, updated_at)
       VALUES ($1, false, $2, $3, NOW(), NOW())
       RETURNING *`,
      [kitchenId, ownerUserId, adminUserId]
    );
    const addressPlaceholder = placeholderResult.rows[0];

    // ✅ Insert full address into staging table
    await pool.query(
      `INSERT INTO kitchen_addresses_staging
       (kitchen_address_id, kitchen_id, address_name, address_line1, address_line2, city, state, zone, postal_code, country, nearest_location, delivery_instruction, status, latitude, longitude, place_id, formatted_address, map_link, created_by, updated_by, created_at, updated_at)
       VALUES
       ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,NOW(),NOW())`,
      [
        addressPlaceholder.id,
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
        ownerUserId,
        adminUserId
      ]
    );

    await pool.query('COMMIT');
    return sendSuccess(res, 'KITCHEN_ADDRESS_STAGED', addressPlaceholder, traceId);

  } catch (err) {
    await pool.query('ROLLBACK');
    return next(err);
  }
};
