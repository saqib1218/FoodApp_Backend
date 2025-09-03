const pool = require('../../../config/database');
const BusinessError = require('../../../lib/businessErrors');
const { sendSuccess } = require('../../../utils/responseHelpers');
const { hasAdminPermissions } = require('../../../services/hasAdminPermissions');
const { validateRequiredFields } = require('../../../utils/validation');
const PERMISSIONS = require('../../../config/permissions');

exports.createPermission = async (req, res, next) => {
  const startTime = Date.now();
  try {
    const userId = req.user?.userId;
    const { key, name, description } = req.body;
       // 2️⃣ Permission check
    await hasAdminPermissions(userId, PERMISSIONS.ADMIN.PERMISSION.CREATE);

    // 1️⃣ Validate input
    const missingFields = validateRequiredFields(req.body, ['key', 'name']);
    if (missingFields.length > 0) {
      throw new BusinessError('COMMON.MISSING_REQUIRED_FIELDS', {
        details: { fields: missingFields },
        traceId: req.traceId,
        retryable: true,
      });
    }

  

    // 3️⃣ Check if key exists (with or without deletion)
    const checkQuery = `
      SELECT id, deleted_at
      FROM admin_permissions
      WHERE key = $1
      LIMIT 1
    `;
    const checkResult = await pool.query(checkQuery, [key]);
    const existing = checkResult.rows[0];

    if (existing) {
      if (!existing.deleted_at) {
        // Case: already exists & not deleted → throw duplication error
        throw new BusinessError('ADMIN.PERMISSION_ALREADY_EXISTS', {
          details: { fields: ['key'], value: key },
          traceId: req.traceId,
          retryable: false,
        });
      } else {
        // Case: exists but soft-deleted → reactivate & update
        const reactivateQuery = `
          UPDATE admin_permissions
          SET name = $2,
              description = $3,
              deleted_at = NULL,
              updated_at = NOW(),
              updated_by = $4
          WHERE id = $1
          RETURNING id, key, name, description, created_by, created_at, updated_at
        `;
        const reactivateResult = await pool.query(reactivateQuery, [
          existing.id,
          name,
          description || null,
          userId,
        ]);

        const permission = reactivateResult.rows[0];
        return sendSuccess(
          res,
          'ADMIN.PERMISSION_RESTORED',
          { permission, meta: { duration_ms: Date.now() - startTime } },
          req.traceId
        );
      }
    }

    // 4️⃣ Otherwise, insert new permission
    const insertQuery = `
      INSERT INTO admin_permissions (key, name, description, created_by)
      VALUES ($1, $2, $3, $4)
      RETURNING id, key, name, description, created_by, created_at
    `;
    const result = await pool.query(insertQuery, [
      key,
      name,
      description || null,
      userId,
    ]);

    const permission = result.rows[0];

    return sendSuccess(
      res,
      'ADMIN.PERMISSION_CREATED',
      { permission, meta: { duration_ms: Date.now() - startTime } },
      req.traceId
    );
  } catch (err) {
    return next(err);
  }
};
