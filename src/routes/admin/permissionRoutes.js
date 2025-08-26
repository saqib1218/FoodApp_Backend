
// routes/admin/roleRoutes.js
const express = require('express');
const router = express.Router();

const permissionController = require('../../controllers/admin/permission'); 
const { authenticateToken } = require('../../middleware/auth');

// PUT → Update a role by ID
router.post('/create',authenticateToken, permissionController.createPermission);
router.patch('/:id',authenticateToken, permissionController.editPermission);
router.get('/',authenticateToken, permissionController.getPermissions);
router.get('/:userId',authenticateToken, permissionController.getPermissionsByUserId);
module.exports = router;
