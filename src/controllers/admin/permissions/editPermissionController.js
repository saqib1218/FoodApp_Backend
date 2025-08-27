const pool = require('../../../config/database');
const BusinessError = require('../../../lib/businessErrors');
const { sendSuccess } = require('../../../utils/responseHelpers');
const { hasAdminPermissions } = require('../../../services/hasAdminPermissions');
const PERMISSIONS = require('../../../config/permissions'); 
exports.editPermission = async (req, res, next) => {
  const startTime = Date.now();
  try {
    const requestingUserId = req.user?.userId;
    const { id } = req.params; // permission ID from URL
    const { key, name, description } = req.body;

    // 1️⃣ Validate required field: ID
    if (!id) {
      throw new BusinessError('MISSING_REQUIRED_FIELDS', {
        details: { fields: ['id'] },
        traceId: req.traceId,
        retryable: true,
      });
    }

    // 2️⃣ Check permission
    await hasAdminPermissions(requestingUserId, PERMISSIONS.ADMIN.PERMISSION.EDIT);

    // // 3️⃣ Check if permission exists
    const permissionCheck = await pool.query(
      'SELECT id, key, name, description, created_by, created_at FROM admin_permissions WHERE id = $1',
      [id]
    );
    if (permissionCheck.rowCount === 0) {
      throw new BusinessError('PERMISSION_NOT_FOUND', { traceId: req.traceId });
    }

    // 4️⃣ Prepare dynamic update for fields provided
    const fieldsToUpdate = [];
    const values = [];
    let idx = 1;

    if (key !== undefined) {
      fieldsToUpdate.push(`key = $${idx++}`);
      values.push(key);
    }
    if (name !== undefined) {
      fieldsToUpdate.push(`name = $${idx++}`);
      values.push(name);
    }
    if (description !== undefined) {
      fieldsToUpdate.push(`description = $${idx++}`);
      values.push(description);
    }

    if (fieldsToUpdate.length === 0) {
      throw new BusinessError('NO_FIELDS_PROVIDED', { traceId: req.traceId });
    }

if (fieldsToUpdate.length > 0) {
  fieldsToUpdate.push(`updated_by = $${idx++}`);
  values.push(requestingUserId);

  fieldsToUpdate.push(`updated_at = NOW()`);
}

const updateQuery = `
  UPDATE admin_permissions
  SET ${fieldsToUpdate.join(', ')}
  WHERE id = $${idx}
  RETURNING id, key, name, description, created_by, created_at, updated_by, updated_at
`;


    values.push(id);
    const result = await pool.query(updateQuery, values);
    const updatedPermission = result.rows[0];

    // 6️⃣ Send response
    return sendSuccess(
      res,
      'PERMISSION_UPDATED',
      {
        permission: updatedPermission,
        meta: { durationMs: Date.now() - startTime },
      },
      req.traceId
    );

  } catch (err) {
    return next(err);
  }
};
