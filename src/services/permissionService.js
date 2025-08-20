const { pool } = require('../config/database');

async function hasPermission(userId, permissionId) {
  const query = `
    SELECT 1
    FROM kitchen_user_roles kur
    JOIN kitchen_roles kr
      ON kur.role_id = kr.id
    JOIN kitchen_role_permissions krp
      ON kr.name = krp.role_name
    WHERE kur.kitchen_user_id = $1
      AND krp.permission_id = $2
    LIMIT 1;
  `;

  try {
    const result = await pool.query(query, [userId, permissionId]);
    if (result.rowCount === 0) {
      console.warn(`❌ Permission denied: User ${userId} does not have '${permissionId}'`);
      return false;
    }
    console.log(`✅ Permission granted: User ${userId} has '${permissionId}'`);
    return true;
  } catch (err) {
    console.error(`❌ Error checking permission for user ${userId} and permission '${permissionId}':`, err);
    throw new Error('Permission check failed');
  }
}

module.exports = {
  hasPermission
};
