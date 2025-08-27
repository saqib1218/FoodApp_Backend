// routes/devAdminRoutes.js
const express = require('express');
const router = express.Router();
const devSuperAdminController = require('../../controllers/admin/auth')
const manageAdminUserController=require('../../controllers/admin/users/createUserController')
const manageAdminRolerController=require('../../controllers/admin/roles/createRoleController')
const manageAdminPermissionController=require('../../controllers/admin/permissions/createPermissionController')
const {authenticateToken} =require('../../middleware/auth');
const authService=require('../../services/authService')
// Development-only route
router.post('/signup/create-superadmin', devSuperAdminController.createSuperAdmin);
router.post('/login', devSuperAdminController.adminUserLogin);
router.post('/create-user',authenticateToken,manageAdminUserController.createUser);
router.post('/create-role',authenticateToken, manageAdminRolerController.createRole);
router.post('/create-permission',authenticateToken, manageAdminPermissionController.createPermission);
router.post('/refresh-token',authService.refreshToken);


module.exports = router;
