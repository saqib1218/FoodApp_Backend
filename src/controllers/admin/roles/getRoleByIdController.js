const pool = require('../../../config/database');
const BusinessError = require('../../../lib/businessErrors');
const { sendSuccess } = require('../../../utils/responseHelpers');

exports.getRoleById = async (req, res, next) => {
  const startTime = Date.now();

  try {
    const roleId = req.params.id; // 🔑 param from route
    const { name, isActive } = req.query;

    // 1️⃣ Build dynamic WHERE clauses
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

    // 2️⃣ Fetch role by ID
    const roleQuery = `
      SELECT id, name, description, is_active, created_at, updated_at
      FROM admin_roles
      ${whereSQL}
      LIMIT 1
    `;

    const roleRes = await pool.query(roleQuery, values);

    if (!roleRes.rows.length) {
      return next(new BusinessError('ADMIN.ROLE_NOT_FOUND'));
    }

    const dbRole = roleRes.rows[0];

    // ✅ Convert to camelCase
    const role = {
      id: dbRole.id,
      name: dbRole.name,
      description: dbRole.description,
      isActive: dbRole.is_active,
      createdAt: dbRole.created_at,
      updatedAt: dbRole.updated_at,
    };

    // 3️⃣ Fetch permissions for this role
    const permissionsQuery = `
      SELECT p.id AS permission_id, p.key, p.name, p.description
      FROM admin_role_permissions rp
      JOIN admin_permissions p ON rp.permission_id = p.id
      WHERE rp.role_id = $1
    `;
    const permissionsRes = await pool.query(permissionsQuery, [roleId]);

    role.permissions = permissionsRes.rows.map((p) => ({
      id: p.permission_id,
      key: p.key,
      name: p.name,
      description: p.description,
    }));

    // 4️⃣ Send response
    return sendSuccess(
      res,
      'ADMIN.ROLE_FETCHED',
      {
        role,
        meta: { durationMs: Date.now() - startTime },
      },
      req.traceId
    );
  } catch (err) {
    console.error('[getRoleById] Error:', err);
    return next(err);
  }
};
