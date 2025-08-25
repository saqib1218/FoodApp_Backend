// routes/admin/user/index.js
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../../middleware/auth');
const userController = require('../../controllers/admin/user');

// CREATE user
router.post('/create',authenticateToken,userController.createUser);



// EDIT user (partial update, PATCH is correct)
router.patch('/:id',authenticateToken, userController.editUser);

// UPDATE user status (active/inactive toggle)
router.patch('/:id/status',authenticateToken, userController.updateUserStatus);
router.delete('/:id',authenticateToken, userController.deleteUser);
// GET /admin/users
router.get('/', authenticateToken, userController.getUsers);
router.get('/:userId', authenticateToken, userController.getUserById);


module.exports = router;
