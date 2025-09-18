const { pool } = require('../../../config/database');
const logger = require('../../../config/logger');
const BusinessError = require('../../../lib/businessErrors');

exports.approveKitchenMedia = async (entityId, subEntityId, traceId) => {
  const log = logger.withTrace({ traceId });
  let client;

  try {
    client = await pool.connect();
    await client.query('BEGIN');

    // 1️⃣ Check if the media exists and belongs to the given kitchen
    const { rows: mediaRows } = await client.query(
      `SELECT id, kitchen_id, status
       FROM kitchen_media
       WHERE id = $1
         AND kitchen_id = $2
         AND deleted_at IS NULL`,
      [subEntityId, entityId]
    );

    if (!mediaRows.length) {
      throw new BusinessError('KITCHEN.MEDIA_NOT_FOUND', {
        traceId,
        details: { mediaId: subEntityId, kitchenId: entityId }
      });
    }

    const media = mediaRows[0];

    // 2️⃣ Update media status → APPROVED
    const { rows: updated } = await client.query(
      `UPDATE kitchen_media
       SET status = 'APPROVED',
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [subEntityId]
    );

    await client.query('COMMIT');

    log.info(
      { entityId, subEntityId, prevStatus: media.status, newStatus: 'APPROVED' },
      '[approveKitchenMedia] ✅ Kitchen media approved'
    );

    return updated[0];
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    if (client) client.release();
  }
};
