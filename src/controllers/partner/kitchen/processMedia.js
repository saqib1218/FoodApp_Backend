const { v4: uuidv4 } = require('uuid');
const pool = require('../../../config/database'); // your DB pool
const  BusinessError  = require('../../../lib/businessErrors');
const { sendSuccess } = require('../../../utils/responseHelpers');
const { hasPermission } = require('../../../services/permissionService');
const { publishImageProcessingEvent } = require('../../../events/imageProcessingEvent');


// Allowed types
const ALLOWED_MEDIA_TYPES = ['image', 'video', 'audio'];
const ALLOWED_CATEGORY_TYPES = ['logo', 'banner', 'thumbnail'];

exports.processMedia = async (req, res, next) => {
  const { kitchenId } = req.params; // Get kitchenId from URL params
  const { mediaType, categoryType } = req.body;
  const file = req.file; // multer puts uploaded file here
  const { userId } = req.user;
  const traceId = req.traceId;

  try {
    console.log('✅ Step 1: Validating binary file upload...');
    
    // Ensure file was uploaded (binary data only)
    if (!file) {
      throw new BusinessError('MISSING_REQUIRED_FIELDS', { traceId, details: ['file'] });
    }

    // Validate file properties
    if (!file.mimetype || !file.size || !file.path) {
      throw new BusinessError('INVALID_FILE_UPLOAD', { traceId, details: ['File must be a valid binary upload'] });
    }

    console.log(`📁 File received: ${file.originalname} (${file.mimetype}, ${file.size} bytes)`);

    // Auto-detect mediaType from file mimetype if not provided
    let detectedMediaType;
    if (file.mimetype.startsWith('image/')) {
      detectedMediaType = 'image';
    } else if (file.mimetype.startsWith('video/')) {
      detectedMediaType = 'video';
    } else if (file.mimetype.startsWith('audio/')) {
      detectedMediaType = 'audio';
    }

    // Use provided mediaType or auto-detected one
    const finalMediaType = mediaType || detectedMediaType;
    
    if (!finalMediaType || !ALLOWED_MEDIA_TYPES.includes(finalMediaType)) {
      throw new BusinessError('INVALID_TYPE', { traceId, details: [finalMediaType || 'unknown'] });
    }

    if (categoryType && !ALLOWED_CATEGORY_TYPES.includes(categoryType)) {
      throw new BusinessError('INVALID_CATEGORY', { traceId, details: [categoryType] });
    }
    
    console.log(`✅ Binary file validated: ${finalMediaType} type`);

    console.log('✅ Step 2: Checking user owns kitchen...');
    const kitchenResult = await pool.query(
      'SELECT * FROM kitchen_users WHERE kitchen_id=$1 AND id=$2 AND deleted_at IS NULL LIMIT 1',
      [kitchenId, userId]
    );
    const kitchen = kitchenResult.rows[0];
    if (!kitchen) {
      throw new BusinessError('USER_NOT_AUTHORIZED', { traceId });
    }
    console.log(`✅ User ${userId} owns kitchen ${kitchenId}`);

    console.log('✅ Step 3: Checking permissions...');
    const allowed = await hasPermission(userId, 'kitchen.media.create', kitchen.role);
    if (!allowed) {
      throw new BusinessError('USER_NOT_AUTHORIZED', { traceId });
    }
    console.log('✅ Permission granted');

    console.log('✅ Step 4: Generating media ID...');
    const mediaId = uuidv4();
    console.log(`Generated media ID: ${mediaId}`);

    console.log('✅ Step 5: Inserting media record into DB with status UPLOADING...');
    await pool.query(
      `INSERT INTO kitchen_media
        (id, kitchen_id, media_type, category_type, status, created_by, updated_by, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())`,
      [mediaId, kitchenId, finalMediaType, categoryType || null, 'UPLOADING', userId, userId]
    );
    console.log('✅ Media record inserted with status: UPLOADING');

    // 6️⃣ Async processing (non-blocking) → RabbitMQ worker will handle S3 upload and processing
 // 6️⃣ Async processing (non-blocking) → RabbitMQ worker will handle S3 upload and processing
setImmediate(async () => {
  try {
    // Send event to RabbitMQ
    await publishImageProcessingEvent({
      mediaId,
      filePath: file.path,
      kitchenId,
      userId,
      categoryType: categoryType || null,
      mediaType: finalMediaType
    });

    console.log(`📨 Media ${mediaId} pushed to RabbitMQ for processing`);

    // Optional: Update status to PROCESSING immediately after queueing
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

    console.log('✅ Step 7: Responding immediately with 202 Accepted');
    return sendSuccess(res, 'MEDIA_PROCESSING_STARTED', { mediaId }, traceId, 202); // 202 Accepted

  } catch (err) {
    console.error('❌ Error in processMedia:', err.message);
    next(err);
  }
};
