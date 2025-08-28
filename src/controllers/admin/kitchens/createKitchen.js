const { pool } = require('../../../config/database');
const BusinessError = require('../../../lib/businessErrors');
const { sendSuccess } = require('../../../utils/responseHelpers');
const { hasAdminPermissions } = require('../../../services/hasAdminPermissions');
const PERMISSIONS = require('../../../config/permissions');

exports.createKitchen = async (req, res, next) => {
  const client = await pool.connect();
  const traceId = req.traceId;

  try {
    // ✅ Ensure admin userId in token
    if (!req.user || !req.user.userId) {
      throw new BusinessError('USER_NOT_AUTHORIZED', { traceId });
    }
    const adminUserId = req.user.userId;

    // 1️⃣ Check admin permission first
    const allowed = await hasAdminPermissions(adminUserId, PERMISSIONS.ADMIN.KITCHEN.CREATE);
    if (!allowed) {
      throw new BusinessError('USER_NOT_AUTHORIZED', { traceId });
    }

    const { name, tagline, bio, ownerId } = req.body;

    // 2️⃣ Validate required fields
    const missingFields = [];
    if (!name) missingFields.push('name');
    if (!ownerId) missingFields.push('ownerId');
    if (missingFields.length > 0) {
      throw new BusinessError('MISSING_REQUIRED_FIELDS', { traceId, details: missingFields });
    }

    await client.query('BEGIN');

    // ✅ Ensure unique kitchen name
    const nameCheck = await client.query(
      `SELECT id FROM kitchens WHERE LOWER(name) = LOWER($1)`,
      [name]
    );
    if (nameCheck.rowCount > 0) {
      throw new BusinessError('KITCHEN_NAME_ALREADY_USED', { traceId, details: [name] });
    }

    // ✅ Ensure owner does not already have a kitchen
    const ownerResult = await client.query(
      `SELECT kitchen_id FROM kitchen_users WHERE user_id = $1 AND deleted_at IS NULL`,
      [ownerId]
    );
    const owner = ownerResult.rows[0];
    if (owner && owner.kitchen_id) {
      throw new BusinessError('KITCHEN_ALREADY_EXISTS', { traceId });
    }

    // ✅ Insert into kitchens table
    const kitchenResult = await client.query(
      `INSERT INTO kitchens (name, tagline, bio, created_by, updated_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $4, NOW(), NOW())
       RETURNING *`,
      [name, tagline || null, bio || null, adminUserId]
    );
    const kitchen = kitchenResult.rows[0];

    // ✅ Link kitchen to owner
    await client.query(
      `UPDATE kitchen_users SET kitchen_id = $1 WHERE user_id = $2 AND deleted_at IS NULL`,
      [kitchen.id, ownerId]
    );

    // ✅ Assign owner role
    const roleResult = await client.query(
      `SELECT id FROM kitchen_roles WHERE name = 'owner' LIMIT 1`
    );
    const ownerRole = roleResult.rows[0];
    if (ownerRole) {
      await client.query(
        `INSERT INTO kitchen_user_roles (kitchen_user_id, role_id, status, created_at, updated_at)
         VALUES ($1, $2, 'active', NOW(), NOW())`,
        [ownerId, ownerRole.id]
      );
    }

    // ✅ Insert into kitchens_staging for audit
    await client.query(
      `INSERT INTO kitchens_staging
        (kitchen_id, owner_id, name, tagline, bio, created_by, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW())`,
      [kitchen.id, ownerId, name, tagline || null, bio || null, adminUserId]
    );

    await client.query('COMMIT');
    return sendSuccess(res, 'KITCHEN_CREATED', kitchen, traceId);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error creating kitchen:', err);
    return next(err);
  } finally {
    client.release();
  }
};
