const { pool } = require('../../../config/database');
const BusinessError = require('../../../lib/businessErrors');
const { sendSuccess } = require('../../../utils/responseHelpers');
const { hasAdminPermissions } = require('../../../services/hasAdminPermissions');
const PERMISSIONS = require('../../../config/permissions');
const logger = require('../../../config/logger');


exports.editKitchenAddress = async (req, res, next) => {
  const { kitchenId, addressId } = req.params.id; // kitchenId + addressId in route
  const log = logger.withTrace(req);

  const {
    addressName,
    addressLine1,
    addressLine2,
    city,
    state,
    zone,
    postalCode,
    country,
    nearestLocation,
    deliveryInstruction,
    latitude,
    longitude,
    placeId,
    formattedAddress,
    mapLink
  } = req.body;

  const adminUserId = req.user?.userId;
  await hasAdminPermissions(adminUserId, PERMISSIONS.ADMIN.KITCHEN.EDIT_ADDRESS);

  try {
    log.info({ adminUserId, kitchenId, addressId }, '[editKitchenAddress] request started');
    log.debug({ body: logger.maskObject(req.body) }, 'Request body (masked)');

    // ✅ Validate required params
    if (!kitchenId || !addressId) {
      throw new BusinessError('COMMON.MISSING_REQUIRED_FIELDS', {
        traceId: req.traceId,
        details: { fields: ['kitchenId', 'addressId'], meta: { reason: 'required' } }
      });
    }

    // ✅ Require at least one field
    if (
      !addressName &&
      !addressLine1 &&
      !addressLine2 &&
      !city &&
      !state &&
      !zone &&
      !postalCode &&
      !country &&
      !nearestLocation &&
      !deliveryInstruction &&
      !latitude &&
      !longitude &&
      !placeId &&
      !formattedAddress &&
      !mapLink
    ) {
      throw new BusinessError('COMMON.NO_FIELDS_TO_UPDATE', {
        traceId: req.traceId,
        details: {
          fields: [
            'addressName',
            'addressLine1',
            'addressLine2',
            'city',
            'state',
            'zone',
            'postalCode',
            'country',
            'nearestLocation',
            'deliveryInstruction',
            'latitude',
            'longitude',
            'placeId',
            'formattedAddress',
            'mapLink'
          ],
          meta: { reason: 'empty_update' }
        }
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // ✅ Check staging record exists
      const { rows: stagingRows } = await client.query(
        `SELECT id 
           FROM kitchen_addresses_staging 
          WHERE kitchen_address_id = $1 
            AND deleted_at IS NULL 
            AND status = 'draft' 
          LIMIT 1`,
        [addressId]
      );

      if (!stagingRows.length) {
        throw new BusinessError('KITCHEN.KITCHEN_ADDRESS_NOT_FOUND', {
          traceId: req.traceId,
          details: { fields: ['addressId'], meta: { reason: 'not_found' } }
        });
      }

      // ✅ Build dynamic update
      const fields = [];
      const values = [];
      let idx = 1;

      if (addressName !== undefined) {
        fields.push(`address_name = $${idx++}`);
        values.push(addressName || null);
      }
      if (addressLine1 !== undefined) {
        fields.push(`address_line1 = $${idx++}`);
        values.push(addressLine1 || null);
      }
      if (addressLine2 !== undefined) {
        fields.push(`address_line2 = $${idx++}`);
        values.push(addressLine2 || null);
      }
      if (city !== undefined) {
        fields.push(`city = $${idx++}`);
        values.push(city || null);
      }
      if (state !== undefined) {
        fields.push(`state = $${idx++}`);
        values.push(state || null);
      }
      if (zone !== undefined) {
        fields.push(`zone = $${idx++}`);
        values.push(zone || null);
      }
      if (postalCode !== undefined) {
        fields.push(`postal_code = $${idx++}`);
        values.push(postalCode || null);
      }
      if (country !== undefined) {
        fields.push(`country = $${idx++}`);
        values.push(country || null);
      }
      if (nearestLocation !== undefined) {
        fields.push(`nearest_location = $${idx++}`);
        values.push(nearestLocation || null);
      }
      if (deliveryInstruction !== undefined) {
        fields.push(`delivery_instruction = $${idx++}`);
        values.push(deliveryInstruction || null);
      }
      if (latitude !== undefined) {
        fields.push(`latitude = $${idx++}`);
        values.push(latitude || null);
      }
      if (longitude !== undefined) {
        fields.push(`longitude = $${idx++}`);
        values.push(longitude || null);
      }
      if (placeId !== undefined) {
        fields.push(`place_id = $${idx++}`);
        values.push(placeId || null);
      }
      if (formattedAddress !== undefined) {
        fields.push(`formatted_address = $${idx++}`);
        values.push(formattedAddress || null);
      }
      if (mapLink !== undefined) {
        fields.push(`map_link = $${idx++}`);
        values.push(mapLink || null);
      }

      values.push(addressId);

      const { rows: updatedRows } = await client.query(
        `UPDATE kitchen_addresses_staging 
            SET ${fields.join(', ')}, updated_at = NOW()
          WHERE kitchen_address_id = $${idx}
          RETURNING *`,
        values
      );

      await client.query('COMMIT');

      return sendSuccess(res, 'KITCHEN.KITCHEN_ADDRESS_UPDATED', updatedRows[0], req.traceId);

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
