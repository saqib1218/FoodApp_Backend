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
    log.info({ params: req.params, body: req.body }, '[editKitchen] Request started');

    const kitchenId = req.params.kitchenId;
    const { name, tagline, bio } = req.body;
    const adminUserId = req.user?.userId;

    // ✅ Permission check
    await hasAdminPermissions(adminUserId, PERMISSIONS.ADMIN.KITCHEN.EDIT);
    log.info({ adminUserId }, '[editKitchen] Admin permissions verified');

    // ✅ Validate required fields
    if (!kitchenId) {
      log.warn({ adminUserId }, '[editKitchen] Missing kitchenId');
      throw new BusinessError('COMMON.MISSING_REQUIRED_FIELDS', {
        traceId: req.traceId,
        details: { fields: ['kitchenId'], meta: { reason: 'required' } }
      });
    }
    if (!name && !tagline && !bio) {
      log.warn({ adminUserId }, '[editKitchen] No fields provided to update');
      throw new BusinessError('COMMON.NO_FIELDS_TO_UPDATE', {
        traceId: req.traceId,
        details: { fields: ['name', 'tagline', 'bio'], meta: { reason: 'empty_update' } }
      });
    }

    await client.query('BEGIN');
    log.info({ kitchenId }, '[editKitchen] Transaction started');

    // ✅ Check main kitchen
    const { rows: kitchenRows } = await client.query(
      `SELECT id, status FROM kitchens WHERE id = $1 AND deleted_at IS NULL`,
      [kitchenId]
    );
    if (!kitchenRows.length) {
      log.error({ kitchenId }, '[editKitchen] Kitchen not found');
      throw new BusinessError('KITCHEN.NOT_FOUND', {
        traceId: req.traceId,
        details: { fields: ['kitchenId'], meta: { reason: 'not_found' } }
      });
    }

    const kitchenStatus = kitchenRows[0].status;
    log.info({ kitchenId, kitchenStatus }, '[editKitchen] Kitchen status checked');

    const fields = [];
    const values = [];
    let idx = 1;

    if (name !== undefined) { fields.push(`name = $${idx++}`); values.push(name); log.info({ field: 'name', value: name }, '[editKitchen] Field to update'); }
    if (tagline !== undefined) { fields.push(`tagline = $${idx++}`); values.push(tagline || null); log.info({ field: 'tagline', value: tagline }, '[editKitchen] Field to update'); }
    if (bio !== undefined) { fields.push(`bio = $${idx++}`); values.push(bio || null); log.info({ field: 'bio', value: bio }, '[editKitchen] Field to update'); }

    values.push(kitchenId);

    let responseData;

    if (kitchenStatus === 'DRAFT') {
      log.info({ kitchenId }, '[editKitchen] Kitchen is draft, updating staging only');
      const { rows: updatedRows } = await client.query(
        `UPDATE kitchens_staging 
          SET ${fields.join(', ')}, updated_at = NOW() 
          WHERE kitchen_id = $${idx}
          RETURNING *`,
        values
      );

      if (!updatedRows.length) {
        log.error({ kitchenId }, '[editKitchen] Staging row not found for update');
        throw new BusinessError('KITCHEN.STAGING_NOT_FOUND', {
          traceId: req.traceId,
          details: { fields: ['kitchenId'], meta: { reason: 'not_found_staging' } }
        });
      }

      responseData = { stagingData: updatedRows[0] };
      log.info({ kitchenId }, '[editKitchen] Staging updated successfully');
    } else if (kitchenStatus === 'SUBMITTED') {
      log.warn({ kitchenId }, '[editKitchen] Kitchen is submitted, update not allowed');
      throw new BusinessError('KITCHEN.UPDATE_NOT_ALLOWED', {
        traceId: req.traceId,
        details: { fields: ['kitchenId'], meta: { reason: 'status_submitted' } }
      });
    } else {
      log.info({ kitchenId }, '[editKitchen] Kitchen approved/other, creating change request');

      // Upsert into staging
      const { rows: stagingRows } = await client.query(
        `INSERT INTO kitchens_staging (kitchen_id, ${fields.map(f => f.split('=')[0]).join(', ')}, created_at, updated_at)
         VALUES ($${idx}, ${fields.map((_, i) => `$${i + 1}`).join(', ')}, NOW(), NOW())
         ON CONFLICT (kitchen_id)
         DO UPDATE SET ${fields.join(', ')}, updated_at = NOW()
         RETURNING *`,
        values
      );
      log.info({ kitchenId, stagingRow: stagingRows[0] }, '[editKitchen] Staging upserted');

      // Create change request
      const workflowId = 'BACKEND_APPROVAL';
      const { rows: changeRequestRows } = await client.query(
        `INSERT INTO change_requests (
            requested_by,
            requested_by_role,
            entity_name,
            entity_id,
            sub_entity_id,
            action,
            status,
            workflow_id,
            created_at,
            updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,'INITIATED',$7,NOW(),NOW())
          RETURNING *`,
        [
          adminUserId,
          'BACKEND',
          'kitchens',
          kitchenId,
          null,
          'KITCHEN_UPDATED',
          workflowId
        ]
      );

      responseData = {
        entityName: changeRequestRows[0].entity_name,
        entityId: changeRequestRows[0].entity_id,
        workflowId: changeRequestRows[0].workflow_id,
        entityData: changeRequestRows[0]
      };
      log.info({ kitchenId, changeRequestId: changeRequestRows[0].id }, '[editKitchen] Change request created');
    }

    await client.query('COMMIT');
    log.info({ kitchenId }, '[editKitchen] Transaction committed');

    // Clear Redis cache
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
          log.info({ key }, '[editKitchen] Redis key deleted');
        }
      }
    }

    log.info({ kitchenId }, '[editKitchen] Kitchen edit completed successfully');
    return sendSuccess(
      res,
      kitchenStatus === 'DRAFT' ? 'KITCHEN.UPDATED' : 'REQUEST.CREATED',
      responseData,
      req.traceId
    );

  } catch (err) {
    await client.query('ROLLBACK');
    log.error({ err }, '[editKitchen] Transaction rolled back due to error');

    if (err.code === '23505' &&
       (['unique_kitchen_staging_name', 'unique_kitchen_name'].includes(err.constraint))) {
      return next(new BusinessError('KITCHEN.NAME_ALREADY_USED', {
        traceId: req.traceId,
        details: { fields: ['name'], meta: { reason: 'duplicate' } }
      }));
    }

    return next(err);
  } finally {
    client.release();
    log.debug({}, '[editKitchen] DB client released');
  }
};
