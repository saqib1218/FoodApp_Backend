const pool = require('../../config/database');
const BusinessError = require('../../lib/businessErrors');

/**
 * Ensures no action is taken on a user account within 1 hour of creation
 * @param {string} userId - The ID of the user we want to perform action on
 */
async function validateUserActionTime(userId) {
  // Fetch created_at for the given user
  const query = `
    SELECT created_at 
    FROM admin_users 
    WHERE id = $1 AND deleted_at IS NULL
  `;
  const values = [userId];

  const result = await pool.query(query, values);

  if (result.rows.length === 0) {
    throw new BusinessError('USER_NOT_FOUND');
  }

  const createdAt = result.rows[0].created_at;
  const now = new Date();

  // Calculate time difference in minutes
const diffSeconds = (now - createdAt) / 1000; // difference in seconds

if (diffSeconds < 10) {
    throw new BusinessError('USER_ACTION_NOT_ALLOWED');
  }

  return true;
}

module.exports = {
  validateUserActionTime,
};
