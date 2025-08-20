// services/permissionService.js or services/roleService.js

const { pool } = require('../config/database');
async function assignRoleToUser(userId, roleName) {
  const roleResult = await pool.query(
    `SELECT id FROM kitchen_roles WHERE name = $1 LIMIT 1`,
    [roleName]
  );

  if (!roleResult.rows.length) throw new Error('Role not found');
  const roleId = roleResult.rows[0].id;

  const existingRole = await pool.query(
    `SELECT * FROM kitchen_user_roles WHERE kitchen_user_id = $1 AND role_id = $2`,
    [userId, roleId]
  );

  if (existingRole.rows.length === 0) {
    await pool.query(
      `INSERT INTO kitchen_user_roles (kitchen_user_id, role_id, status, created_at, updated_at)
       VALUES ($1, $2, 'active', NOW(), NOW())`,
      [userId, roleId]
    );
  }
}


module.exports = { assignRoleToUser };
