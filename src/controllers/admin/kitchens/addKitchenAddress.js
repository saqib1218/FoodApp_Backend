const { pool } = require('../../../config/database');
const BusinessError = require('../../../lib/businessErrors');
const { sendSuccess } = require('../../../utils/responseHelpers');
const { hasAdminPermissions } = require('../../../services/hasAdminPermissions');
const PERMISSIONS = require('../../../config/permissions');
const logger = require('../../../config/logger');
const { redis } = require('../../../config/redisClient');
const { v4: uuidv4 } = require('uuid');

exports.addKitchenAddress = async (req, res, next) => {
  const { kitchenId } = req.params;
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
  await hasAdminPermissions(adminUserId, PERMISSIONS.ADMIN.KITCHEN.ADD_ADDRESS);

  try {
    log.info({ adminUserId, kitchenId }, '[addKitchenAddress] request started');
    log.debug({ body: logger.maskObject(req.body) }, 'Request body (masked)');

    // Validate required fields for staging
    const missingFields = [];
    if (!addressLine1) missingFields.push({ field: 'addressLine1', meta: { reason: 'required' } });
    if (!city) missingFields.push({ field: 'city', meta: { reason: 'required' } });
    if (!country) missingFields.push({ field: 'country', meta: { reason: 'required' } });

    if (missingFields.length > 0) {
      throw new BusinessError('COMMON.MISSING_REQUIRED_FIELDS', {
        traceId: req.traceId,
        details: { fields: missingFields }
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 🔹 Check if kitchen exists and its status
      const { rows: kitchenRows } = await client.query(
        `SELECT status 
         FROM kitchens 
         WHERE id = $1 AND deleted_at IS NULL 
         LIMIT 1`,
        [kitchenId]
      );

      if (!kitchenRows.length) {
        throw new BusinessError('KITCHEN.NOT_FOUND', { traceId: req.traceId });
      }
const kitchenStatus = (kitchenRows[0].status || '').toUpperCase();

      if (kitchenStatus === 'SUBMITTED') {
        throw new BusinessError('KITCHEN.ADDRESS_CREATE_NOT_ALLOWED', {
          traceId: req.traceId,
          details: { reason: 'Kitchen is already submitted, cannot add address.' }
        });
      }

      // prepare mainId upfront
      const mainId = uuidv4();

      if (kitchenStatus === 'APPROVED') {
        await client.query(
          `INSERT INTO change_requests
             (entity_name, entity_id, sub_entity_name, sub_entity_id, action, status,
              requested_by, requested_by_role, workflow_id, created_at, updated_at)
           VALUES ('kitchens', $1, 'kitchen_addresses', $2, 'KITCHEN_ADDRESS_ADDED',
                   'INITIATED', $3, 'BACKEND', 'BACKEND_APPROVAL', NOW(), NOW())`,
          [kitchenId, mainId, adminUserId]
        );
      }

      // 🔹 Get kitchen staging ID
      const { rows: stagingRows } = await client.query(
        `SELECT id AS kitchen_staging_id
         FROM kitchens_staging
         WHERE kitchen_id = $1 AND deleted_at IS NULL
         LIMIT 1`,
        [kitchenId]
      );
      if (!stagingRows.length) throw new BusinessError('KITCHEN.NOT_FOUND', { traceId: req.traceId });

      const kitchenStagingId = stagingRows[0].kitchen_staging_id;

      // 1️⃣ Insert draft record into main table
      await client.query(
        `INSERT INTO kitchen_addresses
         (id, kitchen_id, status, created_at)
         VALUES ($1, $2, 'DRAFT', NOW())`,
        [mainId, kitchenId]
      );

      // 2️⃣ Insert full data into staging table
      const { rows: insertRows } = await client.query(
        `INSERT INTO kitchen_addresses_staging
         (id, kitchen_address_id, kitchen_staging_id, address_name, address_line1, address_line2, city, state, zone,
          postal_code, country, nearest_location, delivery_instruction, status, latitude, longitude, place_id,
          formatted_address, map_link, created_at)
         VALUES
         (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'DRAFT', $13, $14, $15, $16, $17, NOW())
         RETURNING *`,
        [
          mainId,
          kitchenStagingId,
          addressName || null,
          addressLine1,
          addressLine2 || null,
          city || null,
          state || null,
          zone || null,
          postalCode || null,
          country,
          nearestLocation || null,
          deliveryInstruction || null,
          latitude || null,
          longitude || null,
          placeId || null,
          formattedAddress || null,
          mapLink || null
        ]
      );

      const address = insertRows[0];
      await client.query('COMMIT');

      // Clear Redis cache
      if (redis) {
        try {
          await redis.del(`kitchen_addresses:${kitchenId}:all`);
          await redis.del(`kitchen_addresses:${kitchenId}:main`);
          await redis.del(`kitchen_addresses:${kitchenId}:staging`);
        } catch (cacheErr) {
          log.error({ cacheErr }, 'Redis cache delete failed');
        }
      }

      return sendSuccess(res, 'KITCHEN.ADDRESS_STAGED', address, req.traceId);

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
