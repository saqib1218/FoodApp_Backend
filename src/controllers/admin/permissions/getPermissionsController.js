const pool = require('../../../config/database');
const { sendSuccess } = require('../../../utils/responseHelpers');
const { getPagination } = require('../../../utils/getPagination');
const { hasAdminPermissions } = require('../../../services/hasAdminPermissions');
const PERMISSIONS = require('../../../config/permissions'); 
exports.getPermissions = async (req, res, next) => {
  const startTime = Date.now();
  try {
    // 1️⃣ Extract filters & pagination/lazy loading

   const userId = req.user?.userId;

      await hasAdminPermissions(userId, PERMISSIONS.ADMIN.ROLE.LIST_VIEW);
      
    const { search, page, limit, lastId } = req.query;
    const paging = getPagination({ page, limit, lastId, defaultLimit: 20 });

    // 2️⃣ Build dynamic WHERE clauses
    const conditions = ['deleted_at IS NULL']; // <-- exclude deleted permissions
    const values = [];
    let idx = 1;

    if (search) {
      conditions.push(`(key ILIKE $${idx} OR name ILIKE $${idx})`);
      values.push(`%${search}%`);
      idx++;
    }

    if (paging.type === 'lazy' && paging.lastId) {
      conditions.push(`id > $${idx++}`);
      values.push(paging.lastId);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // 3️⃣ Build query with pagination/lazy loading
    const query = `
      SELECT id, key, name, description, created_by, created_at, updated_by, updated_at
      FROM admin_permissions
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${idx++} ${paging.type === 'pagination' ? `OFFSET $${idx++}` : ''}
    `;

    if (paging.type === 'pagination') {
      values.push(paging.limit, paging.offset);
    } else {
      values.push(paging.limit);
    }

    const result = await pool.query(query, values);
    const permissions = result.rows;

    // 4️⃣ Total count for pagination only
    let total = null;
    if (paging.type === 'pagination') {
      const countQuery = `SELECT COUNT(*) AS total FROM admin_permissions ${whereClause}`;
      const countRes = await pool.query(
        countQuery,
        values.slice(0, values.length - (paging.type === 'pagination' ? 2 : 1))
      );
      total = parseInt(countRes.rows[0].total, 10);
    }

    // 5️⃣ Send response
    return sendSuccess(
      res,
      'PERMISSIONS_LIST_FETCHED',
      {
        permissions,
        meta: {
          total,
          limit: paging.limit,
          page: paging.type === 'pagination' ? parseInt(page) : undefined,
          lastId: paging.type === 'lazy' ? paging.lastId : undefined,
          durationMs: Date.now() - startTime,
        },
      },
      req.traceId
    );

  } catch (err) {
    return next(err);
  }
};
