const pool = require('../config/database');
const BusinessError = require('../lib/businessErrors');
const logger = require('../config/logger');

/**
 * Check if an admin user has required permission(s)
 * Only active roles are considered.
 * @param {string} userId - admin user ID (UUID from token)
 * @param {string|string[]} requiredPermissions - single permission or array of permission keys
 * @returns {Promise<boolean>} true if user has permission, otherwise throws BusinessError
 */
async function hasAdminPermissions(userId, requiredPermissions) {
  const permissionsToCheck = Array.isArray(requiredPermissions)
    ? requiredPermissions
    : [requiredPermissions];

  logger.debug({ userId, permissionsToCheck }, '[hasAdminPermissions] start');

  try {
    // 1️⃣ Get all active roles of the user
    const rolesResult = await pool.query(
      `SELECT r.id, r.name
       FROM admin_user_roles ur
       JOIN admin_roles r ON ur.role_id = r.id
       WHERE ur.admin_user_id = $1 AND r.is_active = TRUE`,
      [userId] // userId is UUID
    );

    const roles = rolesResult.rows;
    logger.debug({ roles }, '[hasAdminPermissions] active roles');

    if (!roles.length) {
      logger.warn({ userId }, '[hasAdminPermissions] No active roles assigned');
      throw new BusinessError('ADMIN.USER_NOT_AUTHORIZED', {
        details: {
          fields: ['userId'],
          meta: { userId, reason: 'no_active_roles' }
        }
      });
    }

    const roleIds = roles.map(r => r.id); // INTEGER ids
    logger.debug({ roleIds }, '[hasAdminPermissions] roleIds');

    // 2️⃣ Check if roles have the required permission(s)
    const permissionResult = await pool.query(
      `SELECT DISTINCT p.key
       FROM admin_role_permissions rp
       JOIN admin_permissions p ON rp.permission_id = p.id
       WHERE rp.role_id = ANY($1::int[])   -- FIX: int[] instead of uuid[]
         AND p.key = ANY($2::text[])`,
      [roleIds, permissionsToCheck]
    );

    const grantedPermissions = permissionResult.rows.map(r => r.key);
    logger.debug({ grantedPermissions }, '[hasAdminPermissions] grantedPermissions');

    const missingPermissions = permissionsToCheck.filter(
      p => !grantedPermissions.includes(p)
    );

    if (missingPermissions.length) {
      logger.warn({ userId, missingPermissions }, '[hasAdminPermissions] Missing required permissions');
      throw new BusinessError('ADMIN.USER_NOT_AUTHORIZED', {
        details: {
          fields: ['userId'],
          meta: { userId, reason: 'missing_permission' }
        }
      });
    }

    logger.info({ userId, grantedPermissions }, '[hasAdminPermissions] All required permissions granted');
    return true;
  } catch (err) {
    logger.error({ err, userId }, '[hasAdminPermissions] DB or logic error');
    throw err instanceof BusinessError
      ? err
      : new BusinessError('ADMIN.USER_NOT_AUTHORIZED', {
          details: {
            fields: ['userId'],
            meta: { userId, reason: 'permission_not_found_in_db' }
          }
        });
  }
}

module.exports = { hasAdminPermissions };
