// src/controllers/admin/permissions/createPermissionController.js
const pool = require('../../../config/database');
const BusinessError = require('../../../lib/businessErrors');
const { sendSuccess } = require('../../../utils/responseHelpers');
const { hasAdminPermissions } = require('../../../services/hasAdminPermissions');

exports.createPermission = async (req, res, next) => {
  const startTime = Date.now();
  try {
    const requestingUserId = req.user?.userId; // from access token
    const { key, name, description } = req.body;

    // 1️⃣ Validate input
    const missingFields = [];
    if (!key) missingFields.push('key');
    if (!name) missingFields.push('name');

    if (missingFields.length > 0) {
      throw new BusinessError('MISSING_REQUIRED_FIELDS', {
        details: { fields: missingFields },
        traceId: req.traceId,
        retryable: true,
      });
    }

    // 2️⃣ Check permission
    await hasAdminPermissions(requestingUserId, 'CREATE_PERMISSION');

    // 3️⃣ Insert new permission with created_by
    const insertQuery = `
      INSERT INTO admin_permissions (key, name, description, created_by)
      VALUES ($1, $2, $3, $4)
      RETURNING id, key, name, description, created_by, created_at
    `;
    const result = await pool.query(insertQuery, [
      key,
      name,
      description || null,
      requestingUserId, // store the creator's ID
    ]);

    const permission = result.rows[0];

    // 4️⃣ Send response
    return sendSuccess(
      res,
      'PERMISSION_CREATED_SUCCESS',
      {
        permission,
        meta: { duration_ms: Date.now() - startTime },
      },
      req.traceId
    );

  } catch (err) {
    return next(err);
  }
};
