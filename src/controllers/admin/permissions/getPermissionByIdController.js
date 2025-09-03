const pool = require('../../../config/database');
const BusinessError = require('../../../lib/businessErrors');
const { sendSuccess } = require('../../../utils/responseHelpers');

exports.getPermissionById = async (req, res, next) => {
  const startTime = Date.now();

  try {
    const permissionId = req.params.id; // 🔑 param from route

    // 1️⃣ Extract search filter
    const { search } = req.query;

    // 2️⃣ Build WHERE clause
    const conditions = ['p.id = $1']; // always filter by permissionId
    const values = [permissionId];
    let idx = 2;

    if (search) {
      conditions.push(`(p.key ILIKE $${idx} OR p.name ILIKE $${idx})`);
      values.push(`%${search}%`);
      idx++;
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    // 3️⃣ Fetch the permission by ID
    const query = `
      SELECT p.id, p.key, p.name, p.description, 
             p.created_by, p.created_at, p.updated_by, p.updated_at
      FROM admin_permissions p
      ${whereClause}
      LIMIT 1
    `;

    const result = await pool.query(query, values);

    if (!result.rows.length) {
      return next(new BusinessError('ADMIN.PERMISSION_NOT_FOUND'));
    }

    // 4️⃣ Send response
    return sendSuccess(
      res,
      'ADMIN.PERMISSION_FETCHED',
      {
        permission: result.rows[0],
        meta: { durationMs: Date.now() - startTime },
      },
      req.traceId
    );

  } catch (err) {
    return next(err);
  }
};
