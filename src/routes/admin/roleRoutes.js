
// routes/admin/roleRoutes.js
const express = require('express');
const router = express.Router();

const roleController = require('../../controllers/admin/role'); 
const { authenticateToken } = require('../../middleware/auth');

// PUT → Update a role by ID
router.post('/',authenticateToken, roleController.createRole);
router.put('/:id',authenticateToken, roleController.editRole);
router.delete('/:id',authenticateToken, roleController.deleteRole);
router.get('/',authenticateToken, roleController.getRoles);
router.get('/:userId',authenticateToken, roleController.getRolesByUserId);


module.exports = router;
