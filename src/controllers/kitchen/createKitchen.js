const { pool } = require('../../config/database');
const BusinessError = require('../../lib/businessErrors');
const { sendSuccess } = require('../../utils/responseHelpers');
const { hasPermission } = require('../../services/permissionService');

exports.createKitchen = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { name, tagline, bio } = req.body;

    // Ensure user info
    if (!req.user || !req.user.userId) {
      throw new BusinessError('USER_NOT_AUTHORIZED', { traceId: req.trace_id });
    }
    const userId = req.user.userId;

    // 1️⃣ Validate required fields
    if (!name) {
      throw new BusinessError('MISSING_REQUIRED_FIELDS', {
        traceId: req.trace_id,
        details: ['name']
      });
    }

    // 2️⃣ Check permission **before doing anything**
    const isAuthorized = await hasPermission(userId, 'kitchen.create');
    if (!isAuthorized) {
      throw new BusinessError('USER_NOT_AUTHORIZED', { traceId: req.trace_id });
    }

    await client.query('BEGIN');

    // 3️⃣ Check if kitchen name exists
    const nameCheck = await client.query(
      `SELECT id FROM kitchens WHERE LOWER(name) = LOWER($1)`,
      [name]
    );
    if (nameCheck.rowCount > 0) {
      throw new BusinessError('KITCHEN_NAME_ALREADY_USED', {
        traceId: req.trace_id,
        details: [name]
      });
    }

    // 4️⃣ Check if user already has a kitchen
    const userResult = await client.query(
      `SELECT kitchen_id FROM kitchen_users WHERE id = $1`,
      [userId]
    );
    const user = userResult.rows[0];
    if (user && user.kitchen_id) {
      throw new BusinessError('KITCHEN_ALREADY_EXISTS', { traceId: req.trace_id });
    }

    // 5️⃣ Create kitchen
    const kitchenResult = await client.query(
      `INSERT INTO kitchens (name, tagline, bio, created_by)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, tagline || null, bio || null, userId]
    );
    const kitchen = kitchenResult.rows[0];

    // 6️⃣ Link kitchen to user
    await client.query(
      `UPDATE kitchen_users SET kitchen_id = $1 WHERE id = $2`,
      [kitchen.id, userId]
    );

    // 7️⃣ Assign owner role
    const roleResult = await client.query(
      `SELECT id FROM kitchen_roles WHERE name = 'owner' LIMIT 1`
    );
    const ownerRole = roleResult.rows[0];
    if (ownerRole) {
      await client.query(
        `INSERT INTO kitchen_user_roles (kitchen_user_id, role_id, status)
         VALUES ($1, $2, 'active')`,
        [userId, ownerRole.id]
      );
    }

    await client.query('COMMIT');
    return sendSuccess(res, 'KITCHEN_CREATED', kitchen);

  } catch (err) {
    await client.query('ROLLBACK');
    return next(err);
  } finally {
    client.release();
  }
};
