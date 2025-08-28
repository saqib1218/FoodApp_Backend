const { v4: uuidv4 } = require('uuid'); 
const pool = require('../../../config/database'); 
const BusinessError = require('../../../lib/businessErrors');
const { sendSuccess } = require('../../../utils/responseHelpers');
const { publishImageProcessingEvent } = require('../../../events/imageProcessingEvent');
const PERMISSIONS = require('../../../config/permissions');
const { hasAdminPermissions } = require('../../../services/hasAdminPermissions'); // make sure this exists

// Allowed types
const ALLOWED_MEDIA_TYPES = ['image', 'video', 'audio'];
const ALLOWED_CATEGORY_TYPES = ['logo', 'banner', 'thumbnail'];

exports.processMedia = async (req, res, next) => {
  const { kitchenId } = req.params; 
  const { mediaType, categoryType } = req.body;
  const file = req.file; // multer upload
  const { userId, ownerId } = req.user; // from token
  const traceId = req.traceId;

  try {
    console.log('✅ Step 1: Checking user permission/ownership...');

    // 🔑 Check admin permission first
    const hasAdminPermission = await hasAdminPermissions(userId, PERMISSIONS.ADMIN.KITCHEN.ADD_MEDIA);
    if (!hasAdminPermission && (!ownerId || ownerId !== userId)) {
      throw new BusinessError('USER_NOT_AUTHORIZED', { traceId });
    }
    console.log(`✅ User ${userId} authorized for kitchen ${kitchenId}`);

    console.log('✅ Step 2: Validating file upload...');
    if (!file) {
      throw new BusinessError('MISSING_REQUIRED_FIELDS', { traceId, details: ['file'] });
    }

    if (!file.mimetype || !file.size || !file.path) {
      throw new BusinessError('INVALID_FILE_UPLOAD', { traceId, details: ['File must be a valid binary upload'] });
    }
    console.log(`📁 File received: ${file.originalname} (${file.mimetype}, ${file.size} bytes)`);

    // Detect media type
    let detectedMediaType;
    if (file.mimetype.startsWith('image/')) detectedMediaType = 'image';
    else if (file.mimetype.startsWith('video/')) detectedMediaType = 'video';
    else if (file.mimetype.startsWith('audio/')) detectedMediaType = 'audio';

    const finalMediaType = mediaType || detectedMediaType;
    if (!finalMediaType || !ALLOWED_MEDIA_TYPES.includes(finalMediaType)) {
      throw new BusinessError('INVALID_TYPE', { traceId, details: [finalMediaType || 'unknown'] });
    }

    if (categoryType && !ALLOWED_CATEGORY_TYPES.includes(categoryType)) {
      throw new BusinessError('INVALID_CATEGORY', { traceId, details: [categoryType] });
    }
    console.log(`✅ Binary file validated: ${finalMediaType} type`);

    console.log('✅ Step 3: Generating media ID...');
    const mediaId = uuidv4();

    console.log('✅ Step 4: Inserting media record into DB with status UPLOADING...');
    await pool.query(
      `INSERT INTO kitchen_media
        (id, kitchen_id, media_type, category_type, status, created_by, updated_by, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())`,
      [mediaId, kitchenId, finalMediaType, categoryType || null, 'UPLOADING', userId, userId]
    );
    console.log('✅ Media record inserted with status: UPLOADING');

    // Async processing
    setImmediate(async () => {
      try {
        await publishImageProcessingEvent({
          mediaId,
          filePath: file.path,
          kitchenId,
          userId,
          ownerId: ownerId || null,
          hasAdminPermission: !!hasAdminPermission,
          categoryType: categoryType || null,
          mediaType: finalMediaType
        });

        console.log(`📨 Media ${mediaId} pushed to RabbitMQ for processing`);
        await pool.query(
          'UPDATE kitchen_media SET status=$1, updated_at=NOW() WHERE id=$2',
          ['PROCESSING', mediaId]
        );
        console.log(`✅ Media ${mediaId} status updated to PROCESSING`);
      } catch (err) {
        console.error(`❌ Failed to push media ${mediaId} to RabbitMQ:`, err.message);
        await pool.query(
          'UPDATE kitchen_media SET status=$1, updated_at=NOW() WHERE id=$2',
          ['FAILED', mediaId]
        );
      }
    });

    console.log('✅ Step 5: Responding immediately with 202 Accepted');
    return sendSuccess(res, 'MEDIA_PROCESSING_STARTED', { mediaId }, traceId, 202);

  } catch (err) {
    console.error('❌ Error in processMedia:', err.message);
    next(err);
  }
};
