const pool = require('../../../config/database');
const { sendSuccess } = require('../../../utils/responseHelpers');
const { hasAdminPermissions } = require('../../../services/hasAdminPermissions');
const PERMISSIONS = require('../../../config/permissions'); 

exports.getPermissions = async (req, res, next) => {
  const startTime = Date.now();
  try {
    const userId = req.user?.userId;
    await hasAdminPermissions(userId, PERMISSIONS.ADMIN.ROLE.LIST_VIEW);

    // 1️⃣ Extract filters (no pagination)
    const { search } = req.query;

    // 2️⃣ Build dynamic WHERE clauses
    const conditions = ['deleted_at IS NULL']; // <-- exclude deleted permissions
    const values = [];
    let idx = 1;

    if (search) {
      conditions.push(`(key ILIKE $${idx} OR name ILIKE $${idx})`);
      values.push(`%${search}%`);
      idx++;
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // 3️⃣ Build query (⚡ no pagination)
    const query = `
      SELECT id, key, name, description, created_by, created_at, updated_by, updated_at
      FROM admin_permissions
      ${whereClause}
      ORDER BY created_at DESC
    `;

    const result = await pool.query(query, values);
    const permissions = result.rows;

    // 4️⃣ Send response (⚡ no pagination metadata)
    return sendSuccess(
      res,
      'PERMISSIONS_LIST_FETCHED',
      {
        permissions,
        meta: {
          durationMs: Date.now() - startTime,
        },
      },
      req.traceId
    );

  } catch (err) {
    return next(err);
  }
};
