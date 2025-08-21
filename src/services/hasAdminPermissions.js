const pool = require('../config/database');
const BusinessError = require('../lib/businessErrors');

/**
 * Check if an admin user has required permission(s)
 * @param {string} userId - admin user ID
 * @param {string|string[]} requiredPermissions - single permission or array of permission keys
 * @returns {Promise<boolean>} true if user has permission, otherwise throws error
 */
async function hasAdminPermissions(userId, requiredPermissions) {
  const permissionsToCheck = Array.isArray(requiredPermissions)
    ? requiredPermissions
    : [requiredPermissions];

  console.log('[hasAdminPermissions] userId:', userId);
  console.log('[hasAdminPermissions] permissionsToCheck:', permissionsToCheck);

  // 1️⃣ Get all roles of the user
  const rolesResult = await pool.query(
    `SELECT r.id, r.name
     FROM admin_user_roles ur
     JOIN admin_roles r ON ur.role_id = r.id
     WHERE ur.admin_user_id = $1`,
    [userId]
  );

  const roles = rolesResult.rows;
  console.log('[hasAdminPermissions] roles:', roles);

  if (!roles.length) {
    console.log('[hasAdminPermissions] No roles assigned');
 throw new BusinessError('USER_NOT_AUTHORIZED', {
  details: { missing: missingPermissions },
});
  }

  // 2️⃣ Superadmin bypass: if any role is superadmin, allow everything
  if (roles.some(r => r.name.toLowerCase() === 'superadmin')) {
    console.log('[hasAdminPermissions] Superadmin detected, bypassing permission check');
    return true;
  }

  const roleIds = roles.map(r => r.id);
  console.log('[hasAdminPermissions] roleIds:', roleIds);

  // 3️⃣ Check if roles have the required permission(s)
  const permissionResult = await pool.query(
    `SELECT p.key
     FROM admin_role_permissions rp
     JOIN admin_permissions p ON rp.permission_id = p.id
     WHERE rp.role_id = ANY($1) AND p.key = ANY($2)`,
    [roleIds, permissionsToCheck]
  );

  const grantedPermissions = permissionResult.rows.map(r => r.key);
  console.log('[hasAdminPermissions] grantedPermissions:', grantedPermissions);

  const missingPermissions = permissionsToCheck.filter(
    p => !grantedPermissions.includes(p)
  );

  console.log('[hasAdminPermissions] missingPermissions:', missingPermissions);

  if (missingPermissions.length) {
    console.log('[hasAdminPermissions] User missing required permissions');
  throw new BusinessError('USER_NOT_AUTHORIZED', {
  details: { missing: missingPermissions },
});
  }

  console.log('[hasAdminPermissions] All required permissions granted');
  return true; // all permissions are present
}

module.exports = { hasAdminPermissions };
