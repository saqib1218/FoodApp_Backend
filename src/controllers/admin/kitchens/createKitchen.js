const { pool } = require('../../../config/database');
const BusinessError = require('../../../lib/businessErrors');
const { sendSuccess } = require('../../../utils/responseHelpers');
const { hasAdminPermissions } = require('../../../services/hasAdminPermissions');
const PERMISSIONS = require('../../../config/permissions');
const logger = require('../../../config/logger');
const { redis } = require('../../../config/redisClient');
const {validateString,validateUUID}=require ('../../../utils/validation')

exports.createKitchen = async (req, res, next) => {
  const client = await pool.connect();
  const log = logger.withTrace(req);

  try {
    log.info({}, '[createKitchen] request started');

    const { name, tagline, bio, ownerId } = req.body;
    const adminUserId = req.user?.userId;

    // ✅ Permission check
    await hasAdminPermissions(adminUserId, PERMISSIONS.ADMIN.KITCHEN.CREATE);



// Validate UUIDs
const adminValidation = validateUUID(adminUserId, 'adminUserId');
if (!adminValidation.valid) {
  throw new BusinessError('COMMON.INVALID_FIELD', {
    traceId: req.traceId,
    details: {
      fields: [adminValidation.fieldName],
      meta: { reason: 'Must be a valid UUID' }
    }
  });
}

const ownerValidation = validateUUID(ownerId, 'ownerId');
if (!ownerValidation.valid) {
  throw new BusinessError('COMMON.INVALID_FIELD', {
    traceId: req.traceId,
    details: {
      fields: [ownerValidation.fieldName],
      meta: { reason: 'Must be a valid UUID' }
    }
  });
}


    // ✅ Validate required fields
    const missingFields = [];
    if (!name) missingFields.push('name');
    if (!ownerId) missingFields.push('ownerId');
    if (missingFields.length > 0) {
      throw new BusinessError('COMMON.MISSING_REQUIRED_FIELDS', {
        traceId: req.traceId,
        details: {
          fields: missingFields,
          meta: { reason: 'required' }
        }
      });
    }
try {
  validateString(name, 'Name');
  if (tagline) validateString(tagline, 'Tagline');
  if (bio) validateString(bio, 'Bio');
} catch (err) {
  // Proper format for COMMON.INVALID_FIELD
  throw new BusinessError('COMMON.INVALID_FIELD', {
    traceId: req.traceId,
    details: {
      fields: [err.fieldName || 'unknown'],   // we can add fieldName to helper
      meta: { reason: err.message }
    }
  });
}

    await client.query('BEGIN');

    // ✅ Owner existence + check if already linked
    const { rows: ownerRows } = await client.query(
      `SELECT kitchen_id 
         FROM kitchen_users 
        WHERE id = $1 AND deleted_at IS NULL`,
      [ownerId]
    );

    if (!ownerRows.length) {
      throw new BusinessError('USER.NOT_FOUND', {
        traceId: req.traceId,
        details: {
          fields: ['ownerId'],
          meta: { reason: 'not_found' }
        }
      });
    }

    if (ownerRows[0].kitchen_id) {
      throw new BusinessError('KITCHEN.ALREADY_EXISTS', {
        traceId: req.traceId,
        details: {
          fields: ['ownerId'],
          meta: { reason: 'already_linked' }
        }
      });
    }

    // ✅ Create base kitchen record with status = draft
    const { rows: baseRows } = await client.query(
      `INSERT INTO kitchens (status, created_at) 
       VALUES ('DRAFT', NOW()) 
       RETURNING id, status`
    );
    const kitchenId = baseRows[0].id;

    // ✅ Insert into kitchens_staging
    const { rows: stagingRows } = await client.query(
      `INSERT INTO kitchens_staging 
         (kitchen_id, name, tagline, bio, status, created_at)
       VALUES ($1, $2, $3, $4, 'DRAFT', NOW()) 
       RETURNING *`,
      [kitchenId, name, tagline || null, bio || null]
    );
    const kitchen = stagingRows[0];

    // ✅ Link owner to kitchen
    await client.query(
      `UPDATE kitchen_users 
          SET kitchen_id = $1 
        WHERE id = $2 AND deleted_at IS NULL`,
      [kitchenId, ownerId]
    );

    await client.query('COMMIT');
    log.info({ kitchenId }, '[createKitchen] Kitchen staged successfully (DRAFT)');

if (redis) {
  const keys = [
    'kitchens_staging:details',
    'kitchens_staging:ids',
    `kitchen:${kitchenId}:main`,
    `kitchen:${kitchenId}:staging`,
    'kitchens_main:all',
    'kitchens_staging:all'
  ];

  for (const key of keys) {
    const exists = await redis.exists(key);
    log.info({ key, exists }, 'Checking key existence before deletion');

    if (exists) {
      const deleted = await redis.del(key);
      log.info({ key, deleted }, 'Key deleted from Redis');
    }
  }
}


    return sendSuccess(res, 'KITCHEN.CREATED', kitchen, req.traceId);

  } catch (err) {
    await client.query('ROLLBACK');

    if (err.code === '23505') {
      if (['unique_kitchen_staging_name', 'unique_kitchen_name'].includes(err.constraint)) {
        return next(new BusinessError('KITCHEN.NAME_ALREADY_USED', {
          traceId: req.traceId,
          details: {
            fields: ['name'],
            meta: { reason: 'duplicate' }
          }
        }));
      }
      if (err.constraint === 'uniq_user_per_kitchen') {
        return next(new BusinessError('KITCHEN.ALREADY_EXISTS', {
          traceId: req.traceId,
          details: {
            fields: ['ownerId'],
            meta: { reason: 'already_linked' }
          }
        }));
      }
    }

    log.error({ err }, '[createKitchen] ❌ Error staging kitchen');
    return next(err);
  } finally {
    client.release();
    log.debug({}, '[createKitchen] DB client released');
  }
};
