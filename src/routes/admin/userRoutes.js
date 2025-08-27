// routes/admin/user/index.js
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../../middleware/auth');

const userController = require('../../controllers/admin/users');
const roleController = require('../../controllers/admin/roles');
const permissionController = require('../../controllers/admin/permissions');

/**
 * ==========================
 * USER ROUTES
 * Base: /api/admin/users
 * ==========================
 */

// Create a new user
router.post('/create', authenticateToken, userController.createUser);

// Edit user (partial update using PATCH)
router.patch('/:id', authenticateToken, userController.editUser);

// Update user status (active/inactive)
router.patch('/:id/status', authenticateToken, userController.updateUserStatus);

// Delete user
router.delete('/:id', authenticateToken, userController.deleteUser);

// Get list of all users
router.get('/', authenticateToken, userController.getUsers);

// Get details of a single user by ID
router.get('/:id', authenticateToken, userController.getUserById);


/**
 * ==========================
 * ROLE ROUTES
 * Base: /api/admin/users/:userId/roles
 * ==========================
 */

// Get all roles assigned to a specific user (with permissions)
router.get('/:id/roles', authenticateToken, roleController.getRolesByUserId);


/**
 * ==========================
 * PERMISSION ROUTES
 * Base: /api/admin/users/:userId/permissions
 * ==========================
 */

// Get all permissions assigned to a specific user
router.get('/:id/permissions', authenticateToken, permissionController.getPermissionsByUserId);


module.exports = router;
