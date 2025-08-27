const pool = require('../../../config/database');
const BusinessError = require('../../../lib/businessErrors');
const { sendSuccess } = require('../../../utils/responseHelpers');

exports.getRoleById = async (req, res, next) => {
  const startTime = Date.now();

  try {
    const roleId = req.params.id; // 🔑 param from route

    // 1️⃣ Extract filters
    const { name, isActive } = req.query;

    // 2️⃣ Build dynamic WHERE clauses
    const whereClauses = ['id = $1', 'deleted_at IS NULL']; // ✅ exclude deleted roles
    const values = [roleId];
    let idx = 2;

    if (name) {
      whereClauses.push(`name ILIKE $${idx++}`);
      values.push(`%${name}%`);
    }
    if (isActive !== undefined) {
      whereClauses.push(`is_active = $${idx++}`);
      values.push(isActive === 'true');
    }

    const whereSQL = 'WHERE ' + whereClauses.join(' AND ');

    // 3️⃣ Fetch role by ID without permissions
    const roleQuery = `
      SELECT id, name, description, is_active, created_at, updated_at
      FROM admin_roles
      ${whereSQL}
      LIMIT 1
    `;

    console.log('[getRoleById] Executing query:', roleQuery);
    console.log('[getRoleById] With values:', values);

    const roleRes = await pool.query(roleQuery, values);
    console.log('[getRoleById] Query result:', roleRes.rows);

    if (!roleRes.rows.length) {
      return next(new BusinessError('ROLE_NOT_FOUND'));
    }

    // 4️⃣ Send response
    return sendSuccess(
      res,
      'ROLE_FETCHED',
      {
        role: roleRes.rows[0],
        meta: { durationMs: Date.now() - startTime },
      },
      req.traceId
    );

  } catch (err) {
    console.error('[getRoleById] Error:', err);
    return next(err);
  }
};
