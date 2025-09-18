const { v4: uuidv4 } = require('uuid');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { pool } = require('../../../config/database');
const { sendSuccess } = require('../../../utils/responseHelpers');
const BusinessError = require('../../../lib/businessErrors');
const { hasAdminPermissions } = require('../../../services/hasAdminPermissions');
const PERMISSIONS = require('../../../config/permissions');
const logger = require('../../../config/logger');
const s3Client = require('../../../config/s3Config');
const { validateUUID } = require('../../../utils/validation');

exports.processMedia = async (req, res, next) => {
  const client = await pool.connect();
  const log = logger.withTrace(req);

  try {
    log.info({}, '[processMedia] request started');

    const { kitchenId } = req.params;
    const { mediaItems } = req.body;
   const adminUserId = req.user?.userId;

    // ✅ Permission check
    await hasAdminPermissions(adminUserId, PERMISSIONS.ADMIN.KITCHEN.UPLOAD_MEDIA);

    // ✅ Validate kitchenId
    const kitchenIdValidation = validateUUID(kitchenId, 'kitchenId');
    if (!kitchenIdValidation.valid) {
      throw new BusinessError('COMMON.INVALID_FIELD', {
        traceId: req.traceId,
        details: {
          fields: [kitchenIdValidation.fieldName],
          meta: { reason: 'Must be a valid UUID' }
        }
      });
    }

    // ✅ Validate mediaItems
    if (!Array.isArray(mediaItems) || mediaItems.length === 0) {
      throw new BusinessError('COMMON.MISSING_REQUIRED_FIELDS', {
        traceId: req.traceId,
        details: {
          fields: ['mediaItems'],
          meta: { reason: 'must be a non-empty array' }
        }
      });
    }

    // ✅ Check kitchen status
    const { rows } = await client.query(
      `SELECT status FROM kitchens WHERE id = $1`,
      [kitchenId]
    );

    if (rows.length === 0) {
      throw new BusinessError('KITCHEN.NOT_FOUND', {
        traceId: req.traceId,
        details: {
          fields: ['kitchenId'],
          meta: { reason: 'not_found' }
        }
      });
    }

    const kitchenStatus = rows[0].status.toUpperCase();
    log.info({ kitchenStatus }, '[processMedia] Kitchen status check');

    // ❌ Submitted → reject
    if (kitchenStatus === 'SUBMITTED') {
      throw new BusinessError('KITCHEN.MEDIA_UPLOAD_NOT_ALLOWED', {
        traceId: req.traceId,
        details: {
          fields: ['status'],
          meta: { reason: 'submitted' }
        }
      });
    }

    const results = [];

    for (const item of mediaItems) {
      const { mediaType, categoryType } = item;

      if (!mediaType) {
        throw new BusinessError('COMMON.MISSING_REQUIRED_FIELDS', {
          traceId: req.traceId,
          details: {
            fields: ['mediaType'],
            meta: { reason: 'required' }
          }
        });
      }

      const mediaId = uuidv4();
      const s3Key = `kitchen-media/${mediaId}_original`;

      // ✅ Generate presigned upload URL
      const command = new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: s3Key,
        ContentType: 'application/octet-stream'
      });
      const expirySeconds = parseInt(process.env.S3_UPLOAD_URL_EXPIRY);
      const uploadUrl = await getSignedUrl(s3Client, command, {
        expiresIn: expirySeconds,
      });

      // ✅ Insert media record (without created_by/updated_by)
      await client.query(
        `INSERT INTO kitchen_media
          (id, kitchen_id, media_type, category_type, status, s3_key_original, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())`,
        [mediaId, kitchenId, mediaType, categoryType || null, 'UPLOADING', s3Key]
      );

      results.push({
        mediaId,
        uploadUrl,
        s3Key,
        mediaType,
        categoryType: categoryType || null
      });
    }

    return sendSuccess(res, 'KITCHEN.MEDIA_UPLOAD_URLS_CREATED', { items: results }, req.traceId);
  } catch (err) {
    log.error({ err }, '[processMedia] ❌ Error processing media');
    return next(err);
  } finally {
    client.release();
    log.debug({}, '[processMedia] DB client released');
  }
};
