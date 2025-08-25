const pool = require('../../../config/database');
const BusinessError = require('../../../lib/businessErrors');
const { sendSuccess } = require('../../../utils/responseHelpers');
const { hasAdminPermissions } = require('../../../services/hasAdminPermissions');
const { validateRequiredFields } = require('../../../utils/validation');

exports.createPermission = async (req, res, next) => {
  const startTime = Date.now();
  try {
    const requestingUserId = req.user?.userId; // from access token
    const { key, name, description } = req.body;

    // 1️⃣ Validate input using utility
    const missingFields = validateRequiredFields(req.body, ['key', 'name']);
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
      requestingUserId,
    ]);

    const permission = result.rows[0];

    // 4️⃣ Send response
    return sendSuccess(
      res,
      'PERMISSION_CREATED',
      {
        permission,
        meta: { duration_ms: Date.now() - startTime },
      },
      req.traceId
    );

  } catch (err) {
    // 🛑 Handle duplicate key (unique constraint violation)
    if (err.code === '23505' && err.constraint === 'admin_permissions_key_key') {
      return next(
        new BusinessError('PERMISSION_ALREADY_EXISTS', {
          details: { fields: ['key'], value: req.body.key },
          traceId: req.traceId,
          retryable: false,
        })
      );
    }

    // fallback for other errors
    return next(err);
  }
};
