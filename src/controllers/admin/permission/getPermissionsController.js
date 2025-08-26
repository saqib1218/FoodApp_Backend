const pool = require('../../../config/database');
const BusinessError = require('../../../lib/businessErrors');
const { sendSuccess } = require('../../../utils/responseHelpers');
const { hasAdminPermissions } = require('../../../services/hasAdminPermissions');
const { getPagination } = require('../../../utils/getPagination'); // <-- import util

exports.getPermissions = async (req, res, next) => {
  const startTime = Date.now();
  try {
    const requestingUserId = req.user?.userId;

    // 1️⃣ Permission check
    await hasAdminPermissions(requestingUserId, 'VIEW_PERMISSION');

    // 2️⃣ Extract filters & pagination/lazy loading
    const { search, page, limit, lastId } = req.query;
    const paging = getPagination({ page, limit, lastId, defaultLimit: 20 });

    // 3️⃣ Build dynamic WHERE clauses
    const conditions = [];
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

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 4️⃣ Build query with pagination/lazy loading
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

    // 5️⃣ Total count for pagination only
    let total = null;
    if (paging.type === 'pagination') {
      const countQuery = `SELECT COUNT(*) AS total FROM admin_permissions ${whereClause}`;
      const countRes = await pool.query(countQuery, values.slice(0, values.length - (paging.type === 'pagination' ? 2 : 1)));
      total = parseInt(countRes.rows[0].total, 10);
    }

    // 6️⃣ Send response
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
