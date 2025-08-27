const { pool } = require('../../../config/database');
const BusinessError = require('../../../lib/businessErrors');
const { sendSuccess } = require('../../../utils/responseHelpers');
const { hasAdminPermissions } = require('../../../services/hasAdminPermissions');

exports.createKitchen = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { name, tagline, bio, ownerUserId } = req.body; // camelCase

    // Ensure admin user info
    if (!req.user || !req.user.userId) {
      throw new BusinessError('USER_NOT_AUTHORIZED', { traceId: req.traceId });
    }
    const adminUserId = req.user.userId;

    // Validate required fields
    if (!name || !ownerUserId) {
      throw new BusinessError('MISSING_REQUIRED_FIELDS', {
        traceId: req.traceId,
        details: !name ? ['name'] : ['ownerUserId']
      });
    }

    // Admin permission check
    await hasAdminPermissions(adminUserId, 'kitchen.create');

    await client.query('BEGIN');

    // Check if owner user exists and doesn't already have a kitchen
    const ownerResult = await client.query(
      `SELECT kitchen_id FROM kitchen_users WHERE id = $1`,
      [ownerUserId]
    );
    if (!ownerResult.rowCount) {
      throw new BusinessError('USER_NOT_FOUND', { traceId: req.traceId });
    }
    if (ownerResult.rows[0].kitchen_id) {
      throw new BusinessError('USER_ALREADY_HAS_KITCHEN', { traceId: req.traceId });
    }

    // Create placeholder kitchen record
    const kitchenResult = await client.query(
      `INSERT INTO kitchens (name, status, created_by) 
       VALUES ($1, 'pending', $2) RETURNING *`,
      [name, adminUserId]
    );
    const kitchen = kitchenResult.rows[0];

    // Link kitchen to owner user
    await client.query(
      `UPDATE kitchen_users SET kitchen_id = $1 WHERE id = $2`,
      [kitchen.id, ownerUserId]
    );

    // Insert full data into staging table
    await client.query(
      `INSERT INTO kitchen_staging (
          kitchen_id,
          name,
          tagline,
          bio,
          created_by,
          updated_by,
          created_at,
          updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())`,
      [kitchen.id, name, tagline || null, bio || null, ownerUserId, adminUserId]
    );

    await client.query('COMMIT');
    return sendSuccess(res, 'KITCHEN_CREATED', kitchen);

  } catch (err) {
    await client.query('ROLLBACK');
    return next(err);
  } finally {
    client.release();
  }
};
