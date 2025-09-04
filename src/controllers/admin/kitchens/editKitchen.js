const { pool } = require('../../../config/database');
const BusinessError = require('../../../lib/businessErrors');
const { sendSuccess } = require('../../../utils/responseHelpers');
const { hasAdminPermissions } = require('../../../services/hasAdminPermissions');
const PERMISSIONS = require('../../../config/permissions');
const logger = require('../../../config/logger');
const { redis } = require('../../../config/redisClient');

exports.editKitchen = async (req, res, next) => {
  const client = await pool.connect();
  const log = logger.withTrace(req);

  try {
    log.info({}, '[editKitchen] request started');

    const { kitchenId } = req.params.id;
    const { name, tagline, bio } = req.body;
    const adminUserId = req.user?.userId;

    // ✅ Permission check
    await hasAdminPermissions(adminUserId, PERMISSIONS.ADMIN.KITCHEN.EDIT);

    // ✅ Validate required fields
    if (!kitchenId) {
      throw new BusinessError('COMMON.MISSING_REQUIRED_FIELDS', {
        traceId: req.traceId,
        details: { fields: ['kitchenId'], meta: { reason: 'required' } }
      });
    }

    if (!name && !tagline && !bio) {
      throw new BusinessError('COMMON.NO_FIELDS_TO_UPDATE', {
        traceId: req.traceId,
        details: { fields: ['name', 'tagline', 'bio'], meta: { reason: 'empty_update' } }
      });
    }

    await client.query('BEGIN');

    // ✅ Check kitchen exists
    const { rows: kitchenRows } = await client.query(
      `SELECT id FROM kitchens WHERE id = $1 AND deleted_at IS NULL`,
      [kitchenId]
    );

    if (!kitchenRows.length) {
      throw new BusinessError('KITCHEN.KITCHEN_NOT_FOUND', {
        traceId: req.traceId,
        details: { fields: ['kitchenId'], meta: { reason: 'not_found' } }
      });
    }

    // ✅ Build dynamic update query for staging
    const fields = [];
    const values = [];
    let idx = 1;

    if (name) {
      fields.push(`name = $${idx++}`);
      values.push(name);
    }
    if (tagline !== undefined) {
      fields.push(`tagline = $${idx++}`);
      values.push(tagline || null);
    }
    if (bio !== undefined) {
      fields.push(`bio = $${idx++}`);
      values.push(bio || null);
    }

    values.push(kitchenId);

    const { rows: updatedRows } = await client.query(
      `UPDATE kitchens_staging 
          SET ${fields.join(', ')}, updated_at = NOW() 
        WHERE kitchen_id = $${idx}
      RETURNING *`,
      values
    );

    if (!updatedRows.length) {
      throw new BusinessError('KITCHEN.KITCHEN_STAGING_NOT_FOUND', {
        traceId: req.traceId,
        details: { fields: ['kitchenId'], meta: { reason: 'not_found_staging' } }
      });
    }

    await client.query('COMMIT');

    // ✅ Clear Redis cache
    if (redis) {
      const keys = [
        `kitchen:${kitchenId}:main`,
        `kitchen:${kitchenId}:staging`,
        'kitchens_staging:details',
        'kitchens_staging:ids',
        'kitchens_staging:all',
        'kitchens_main:all'
      ];

      for (const key of keys) {
        const exists = await redis.exists(key);
        if (exists) {
          await redis.del(key);
          log.info({ key }, '[editKitchen] Key deleted from Redis');
        }
      }
    }

    log.info({ kitchenId }, '[editKitchen] Kitchen updated successfully');
    return sendSuccess(res, 'KITCHEN.KITCHEN_UPDATED', updatedRows[0], req.traceId);

  } catch (err) {
    await client.query('ROLLBACK');

    if (err.code === '23505' && 
       (['unique_kitchen_staging_name', 'unique_kitchen_name'].includes(err.constraint))) {
      return next(new BusinessError('KITCHEN.KITCHEN_NAME_ALREADY_USED', {
        traceId: req.traceId,
        details: { fields: ['name'], meta: { reason: 'duplicate' } }
      }));
    }

    log.error({ err }, '[editKitchen] ❌ Error editing kitchen');
    return next(err);
  } finally {
    client.release();
    log.debug({}, '[editKitchen] DB client released');
  }
};
