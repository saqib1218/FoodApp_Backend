const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const { GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const amqplib = require('amqplib');

const { pool } = require('../config/database');
const s3 = require('../config/s3Config');
const logger = require('../config/logger');

const S3_BUCKET = process.env.S3_BUCKET;

const RABBITMQ_URL = process.env.RABBITMQ_URL;
const EXCHANGE = process.env.RIWAYAT_EXCHANGE;
const QUEUE = process.env.RIWAYAT_MEDIA_QUEUE;
const RETRY_QUEUE = process.env.RIWAYAT_MEDIA_RETRY_QUEUE;
const DEAD_QUEUE = process.env.RIWAYAT_MEDIA_DEAD_QUEUE;
const ROUTING_KEY = process.env.RIWAYAT_MEDIA_ROUTING_KEY;

// Retry/Dead settings
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 30000; // 30 sec delay

// ---------- Extract media info ----------
function extractMediaInfo(msgContent) {
  if (!msgContent.key) {
    throw new Error('Invalid RabbitMQ message content');
  }

  const keyParts = msgContent.key.split('/');
  const filename = keyParts[keyParts.length - 1];
  const mediaId = filename.split('_')[0];

  return { mediaId, s3KeyOriginal: msgContent.key };
}

// ---------- S3 helpers ----------
async function downloadFromS3(key, localPath, traceId) {
  logger.info({ traceId, key }, '⬇️ Downloading file from S3');

  const data = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
  const tmpDir = path.join(__dirname, 'tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  if (!localPath) localPath = path.join(tmpDir, key);

  return new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(localPath);
    data.Body.pipe(stream);
    stream.on('finish', () => {
      logger.info({ traceId, localPath }, '✅ Download complete');
      resolve();
    });
    stream.on('error', (err) => {
      logger.error({ traceId, err }, '❌ Download failed');
      reject(err);
    });
  });
}

async function uploadToS3(localPath, s3Key, mimeType, traceId) {
  logger.info({ traceId, localPath, s3Key }, '⬆️ Uploading file to S3');
  const fileStream = fs.createReadStream(localPath);
  await s3.send(
    new PutObjectCommand({ Bucket: S3_BUCKET, Key: s3Key, Body: fileStream, ContentType: mimeType })
  );
  logger.info({ traceId, s3Key }, '✅ Upload complete');
}

// ---------- Media processing ----------
async function processImage(inputPath, outputPath, traceId) {
  logger.info({ traceId, inputPath }, '🖼 Processing image');
  await sharp(inputPath).resize(800).jpeg({ quality: 80 }).toFile(outputPath);
  logger.info({ traceId, outputPath }, '✅ Image processed');
}

async function processVideoAudio(inputPath, outputPath, mediaType, traceId) {
  logger.info({ traceId, inputPath, mediaType }, '🎞 Processing video/audio');
  return new Promise((resolve, reject) => {
    let command = ffmpeg(inputPath);

    if (mediaType === 'video') {
      command.outputOptions(['-crf 28', '-preset veryfast']).format('mp4');
    }

    if (mediaType === 'audio') {
      command.audioCodec('aac').outputOptions('-q:a 2').format('m4a');
    }

    command
      .save(outputPath)
      .on('end', () => {
        logger.info({ traceId, outputPath }, '✅ Video/Audio processed');
        resolve();
      })
      .on('error', (err) => {
        logger.error({ traceId, err }, '❌ Video/Audio processing failed');
        reject(err);
      });
  });
}

async function generateVideoThumbnail(inputPath, thumbnailPath, traceId) {
  logger.info({ traceId, inputPath }, '🖼 Generating video thumbnail');
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .screenshots({
        timestamps: ['00:00:01'],
        filename: path.basename(thumbnailPath),
        folder: path.dirname(thumbnailPath),
        size: '640x?',
      })
      .on('end', () => {
        logger.info({ traceId, thumbnailPath }, '✅ Thumbnail generated');
        resolve();
      })
      .on('error', (err) => {
        logger.error({ traceId, err }, '❌ Thumbnail generation failed');
        reject(err);
      });
  });
}

// ---------- Message handler ----------
async function processMessage(msg, channel) {
  const traceId = `trace_${Date.now()}`;
  let localFiles = [];

  const getFileSizeInMB = (filePath) => {
    if (!fs.existsSync(filePath)) return 0;
    const stats = fs.statSync(filePath);
    return (stats.size / (1024 * 1024)).toFixed(2);
  };

  try {
    const msgContent = JSON.parse(msg.content.toString());
    logger.info({ traceId, msgContent }, '📥 Received RabbitMQ message');

    if (msgContent.forceFail) throw new Error('Forced failure for testing retry/dead queue');

    if (!msgContent.key || !msgContent.key.includes('_original')) {
      logger.info({ traceId, key: msgContent.key }, '⏭ Skipping non-original media');
      return channel.ack(msg);
    }

    const { mediaId, s3KeyOriginal } = extractMediaInfo(msgContent);

    // Fetch metadata
    const { rows } = await pool.query(
      `SELECT km.media_type, km.category_type, km.kitchen_id, k.status AS kitchen_status
       FROM kitchen_media km
       JOIN kitchens k ON km.kitchen_id = k.id
       WHERE km.id=$1`,
      [mediaId]
    );
    if (!rows.length) throw new Error(`Media not found for id ${mediaId}`);
    const { media_type: mediaType, category_type: imageCategory, kitchen_id: kitchenId, kitchen_status: kitchenStatus } = rows[0];

    // Local paths
    const ext = mediaType === 'image' ? '.jpeg' : mediaType === 'video' ? '.mp4' : '.mp3';
    const localOriginal = path.join(__dirname, 'tmp', `${mediaId}_original${path.extname(s3KeyOriginal)}`);
    const localProcessed = path.join(__dirname, 'tmp', `${mediaId}_processed${ext}`);
    const localThumbnail = path.join(__dirname, 'tmp', `${mediaId}_thumbnail.jpg`);
    localFiles.push(localOriginal, localProcessed, localThumbnail);

    await downloadFromS3(s3KeyOriginal, localOriginal, traceId);

    const originalSizeMB = getFileSizeInMB(localOriginal);
    logger.info({ traceId, originalSizeMB }, `📦 Original file size: ${originalSizeMB} MB`);

    if (mediaType === 'image') {
      await processImage(localOriginal, localProcessed, traceId);
    } else {
      await processVideoAudio(localOriginal, localProcessed, mediaType, traceId);
      if (mediaType === 'video') {
        await generateVideoThumbnail(localOriginal, localThumbnail, traceId);
      }
    }

    const processedSizeMB = getFileSizeInMB(localProcessed);
    logger.info({ traceId, processedSizeMB }, `📦 Processed file size: ${processedSizeMB} MB`);

    if (originalSizeMB > 0 && processedSizeMB > 0) {
      const ratio = ((processedSizeMB / originalSizeMB) * 100).toFixed(2);
      logger.info({ traceId, ratio }, `📉 Compression ratio: ${ratio}% of original`);
    }

    const imageCategoryMap = { standard: 'standard', logo: 'logo', banner: 'banner' };
  let s3KeyProcessed =
  mediaType === 'image'
    ? `kitchen-media/${mediaId}_processed_${imageCategoryMap[imageCategory] || 'standard'}${ext}`
    : `kitchen-media/${mediaId}_processed${ext}`;


    await uploadToS3(
      localProcessed,
      s3KeyProcessed,
      mediaType === 'image' ? 'image/jpeg' : mediaType === 'video' ? 'video/mp4' : 'audio/mpeg',
      traceId
    );

    let s3KeyThumbnail = null;
    if (mediaType === 'video' && fs.existsSync(localThumbnail)) {
      s3KeyThumbnail = `kitchen-media/${mediaId}_processed_thumbnail.jpg`;
      await uploadToS3(localThumbnail, s3KeyThumbnail, 'image/jpeg', traceId);
    }

    // Update DB as UPLOADED
    if (mediaType === 'image') {
      const columnMap = { standard: 's3_key_processed', logo: 's3_key_processed', banner: 's3_key_processed' };
      const column = columnMap[imageCategory] || 's3_key_processed';
      await pool.query(
        `UPDATE kitchen_media SET ${column}=$1, status='UPLOADED', updated_at=NOW() WHERE id=$2`,
        [s3KeyProcessed, mediaId]
      );
    } else {
      await pool.query(
        `UPDATE kitchen_media SET s3_key_processed=$1, s3_key_thumbnail=$2, status='UPLOADED', updated_at=NOW() WHERE id=$3`,
        [s3KeyProcessed, s3KeyThumbnail, mediaId]
      );
    }

    // Mark as PROCESSED
    await pool.query(`UPDATE kitchen_media SET status='PROCESSED', updated_at=NOW() WHERE id=$1`, [mediaId]);
    logger.info({ traceId, mediaId }, '✅ Media marked as PROCESSED in DB');

    // Create change_request if kitchen is APPROVED
    if (kitchenStatus !== 'DRAFT' && kitchenStatus !== 'SUBMITTED') {
     await pool.query(
  `INSERT INTO change_requests 
     (requested_by, requested_by_role, entity_name, entity_id, sub_entity_name, sub_entity_id, status, action, workflow_id, created_at, updated_at)
   VALUES ('NULL','BACKEND','kitchens',$1,'kitchen_media',$2,'INITIATED','KITCHEN_MEDIA_UPLOADED','BACKEND_APPROVAL',NOW(),NOW())`,
  [kitchenId, mediaId]
);
      logger.info({ traceId, kitchenId, mediaId }, '📝 Change request created with INITIATED');
    } else {
      logger.info({ traceId, kitchenId, kitchenStatus }, 'ℹ️ Kitchen in DRAFT/SUBMITTED → No change_request created');
    }

    channel.ack(msg);
    logger.info({ traceId, mediaId }, '👍 Message acknowledged');
  } catch (err) {
    logger.error({ traceId, err }, '❌ Failed processing media');

    try {
      let retries = (msg.properties.headers['x-retries'] || 0) + 1;
      if (retries > MAX_RETRIES) {
        logger.error({ traceId, retries }, '🚨 Max retries exceeded, sending to DEAD queue');
        await channel.sendToQueue(DEAD_QUEUE, msg.content, { persistent: true });
      } else {
        logger.warn({ traceId, retries }, '🔁 Sending to RETRY queue');
        await channel.sendToQueue(RETRY_QUEUE, msg.content, {
          persistent: true,
          headers: { 'x-retries': retries },
          expiration: RETRY_DELAY_MS.toString(),
        });
      }
      channel.ack(msg);
    } catch (publishErr) {
      logger.error({ traceId, publishErr }, '❌ Failed to publish to retry/dead queue');
      channel.nack(msg, false, true);
    }
  } finally {
    for (const f of localFiles) {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
        logger.info({ traceId, f }, '🧹 Local file cleaned up');
      } catch (cleanupErr) {
        logger.warn({ traceId, cleanupErr, f }, '⚠️ Failed to clean local file');
      }
    }
  }
}

// ---------- Worker ----------
async function startWorker() {
  const conn = await amqplib.connect(RABBITMQ_URL);
  const channel = await conn.createChannel();

  await channel.assertExchange(EXCHANGE, 'direct', { durable: true });

  await channel.assertQueue(QUEUE, { durable: true });
  await channel.bindQueue(QUEUE, EXCHANGE, ROUTING_KEY);

  await channel.assertQueue(RETRY_QUEUE, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': EXCHANGE,
      'x-dead-letter-routing-key': ROUTING_KEY,
    },
  });

  await channel.assertQueue(DEAD_QUEUE, { durable: true });

  logger.info(`🚀 Worker started, waiting for messages in ${QUEUE}`);

  channel.consume(QUEUE, (msg) => processMessage(msg, channel), { noAck: false });
}

startWorker().catch((err) => logger.error({ err }, '❌ Worker failed to start'));
module.exports={startWorker};