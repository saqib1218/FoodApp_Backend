
// routes/admin/roleRoutes.js
const express = require('express');
const router = express.Router();

const permissionController = require('../../controllers/admin/permissions'); 
const { authenticateToken } = require('../../middleware/auth');

// PUT → Update a role by ID
router.post('/create',authenticateToken, permissionController.createPermission);
router.patch('/:id',authenticateToken, permissionController.editPermission);
router.get('/',authenticateToken, permissionController.getPermissions);
router.get('/by-id/:id', authenticateToken, permissionController.getPermissionById);

// Get permissions for a specific user
router.get('/by-user/:userId', authenticateToken, permissionController.getPermissionsByUserId);

router.delete('/:id',authenticateToken, permissionController.deletePermission);
module.exports = router;
