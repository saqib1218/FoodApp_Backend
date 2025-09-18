const { pool } = require('../../../config/database');
const { sendSuccess } = require('../../../utils/responseHelpers');
const logger = require('../../../config/logger');
const axios = require('axios');
const BusinessError = require('../../../lib/businessErrors');
const { hasAdminPermissions } = require('../../../services/hasAdminPermissions');
const PERMISSIONS = require('../../../config/permissions');

exports.getKitchenMediaByKitchenId = async (req, res, next) => {
  const log = logger.withTrace(req);
  const kitchenId = req.params.kitchenId;
  const adminUserId = req.user?.userId;

  if (!kitchenId) {
    log.warn('No kitchenId provided');
    return next(
      new BusinessError('COMMON.MISSING_REQUIRED_FIELDS', {
        traceId: req.traceId,
        details: {
          fields: [{ field: 'kitchenId', meta: { reason: 'required' } }],
        },
      })
    );
  }

  log.info({ kitchenId }, '[getKitchenMediaByKitchenId] request started');

  const client = await pool.connect();
  try {
    // ✅ Permission check
    await hasAdminPermissions(adminUserId, PERMISSIONS.ADMIN.KITCHEN.VIEW_MEDIA);

    const query = `
      SELECT 
        id,
        kitchen_id,
        media_type,
        s3_key_processed,
        s3_key_thumbnail,  -- ✅ added thumbnail
        created_at
      FROM kitchen_media
      WHERE kitchen_id = $1
        AND deleted_at IS NULL
      ORDER BY created_at DESC
    `;

    log.info({ query, params: [kitchenId] }, 'Executing SQL query');
    const { rows } = await client.query(query, [kitchenId]);


    // ✅ CloudFront cache check for both video + thumbnail
    const mediaWithCacheStatus = await Promise.all(
      rows.map(async (m) => {
        const urlsToCheck = [];

        // processed URL always
        if (m.s3_key_processed) {
          urlsToCheck.push({
            type: 'processed',
            url: `https://${process.env.CLOUDFRONT_DOMAIN}/${m.s3_key_processed}`,
          });
        }

        // if video then also check thumbnail
        if (m.media_type === 'video' && m.s3_key_thumbnail) {
          urlsToCheck.push({
            type: 'thumbnail',
            url: `https://${process.env.CLOUDFRONT_DOMAIN}/${m.s3_key_thumbnail}`,
          });
        }

        const cacheStatuses = [];

        for (const item of urlsToCheck) {
          let cacheStatus = 'UNKNOWN';
          let responseTime = null;
          try {
            const start = Date.now();
            const response = await axios.head(item.url);
            responseTime = Date.now() - start;
            cacheStatus = response.headers['x-cache'] || 'NO_HEADER';
          } catch (err) {
            log.warn({ url: item.url, error: err.message }, 'Error checking CloudFront cache');
          }

          cacheStatuses.push({
            type: item.type,
            url: item.url,
            cacheStatus,
            responseTimeMs: responseTime,
          });
        }

        return {
          ...m,
          cacheInfo: cacheStatuses, // ✅ processed + thumbnail info
        };
      })
    );

    log.info({ kitchenId, count: mediaWithCacheStatus.length }, 'Kitchen media fetched with cache status');

    return sendSuccess(res, 'KITCHEN.MEDIA_FETCHED', mediaWithCacheStatus, req.traceId);
  } catch (err) {
    log.error({ err }, '❌ Error fetching kitchen media');
    return next(err);
  } finally {
    client.release();
    log.debug({}, 'DB client released');
  }
};
