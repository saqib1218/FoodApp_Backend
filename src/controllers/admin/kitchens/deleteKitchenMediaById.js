const { pool } = require('../../../config/database');
const { sendSuccess } = require('../../../utils/responseHelpers');
const logger = require('../../../config/logger');
const s3Client = require('../../../config/s3Config');
const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { invalidateCloudFront } = require('../../../utils/invalidateCloudFront');
const BusinessError = require('../../../lib/businessErrors');
const { hasAdminPermissions } = require('../../../services/hasAdminPermissions');
const PERMISSIONS = require('../../../config/permissions');

exports.deleteKitchenMedia = async (req, res, next) => {
  const log = logger.withTrace(req);
  const { kitchenId, mediaId } = req.params;
     const adminUserId = req.user?.userId;
  if (!kitchenId || !mediaId) {
    return next(
      new BusinessError('COMMON.MISSING_REQUIRED_FIELDS', {
        traceId: req.traceId,
        details: [
          { field: 'kitchenId', meta: { reason: 'required' } },
          { field: 'mediaId', meta: { reason: 'required' } },
        ],
      })
    );
  }

  const client = await pool.connect();
  try {
    log.info({ kitchenId, mediaId }, '[deleteKitchenMedia] request started');

    // ✅ Permission check
    await hasAdminPermissions(adminUserId, PERMISSIONS.ADMIN.KITCHEN.DELETE_MEDIA);

    // ✅ Fetch the media and ensure it belongs to the kitchen
    const { rows } = await client.query(
      `SELECT s3_key_processed, s3_key_original, deleted_at
         FROM kitchen_media 
        WHERE id=$1 AND kitchen_id=$2`,
      [mediaId, kitchenId]
    );

    if (!rows.length) {
      throw new BusinessError('KITCHEN.MEDIA_NOT_FOUND', {
        traceId: req.traceId,
        details: [{ field: 'mediaId', meta: { reason: 'not_found' } }],
      });
    }

    if (rows[0].deleted_at) {
      return sendSuccess(res, 'KITCHEN.MEDIA_ALREADY_DELETED', null, req.traceId);
    }

    const { s3_key_processed, s3_key_original } = rows[0];

    // ✅ Delete from S3
    const deleteKeys = [s3_key_processed, s3_key_original].filter(Boolean);
    await Promise.all(
      deleteKeys.map(async (Key) => {
        try {
          await s3Client.send(
            new DeleteObjectCommand({
              Bucket: process.env.S3_BUCKET,
              Key,
            })
          );
          log.info({ Key }, 'Deleted from S3');
        } catch (err) {
          log.error({ Key, err }, 'Failed to delete from S3');
          throw new Error(`Failed to delete ${Key} from S3`);
        }
      })
    );

    // ✅ Invalidate CloudFront cache
    if (deleteKeys.length) {
      await invalidateCloudFront(deleteKeys.map((key) => `/${key}`));
      log.info({ keys: deleteKeys }, 'CloudFront cache invalidated');
    }

    // ✅ Soft delete in DB
    await client.query(
      `UPDATE kitchen_media 
          SET deleted_at = NOW(), updated_at = NOW(), updated_by = $2 
        WHERE id = $1`,
      [mediaId, userId]
    );
    log.info({ mediaId }, 'Soft deleted from DB');

    return sendSuccess(res, 'KITCHEN.MEDIA_DELETED', null, req.traceId);
  } catch (err) {
    log.error({ err }, '❌ Error deleting kitchen media');
    return next(err);
  } finally {
    client.release();
    log.debug({}, 'DB client released');
  }
};
