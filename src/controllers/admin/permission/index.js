// controllers/admin/user/index.js

const createPermissionController = require('./createPermissionController');
const editPermissionController = require('./editPermissionController');
const getPermissionsController=require('./getPermissionsController')
const getPermissionsByUserId=require('./getPermissionsByUserIdController')

module.exports = {
  ...createPermissionController,
  ...editPermissionController,
  ...getPermissionsController,
  ...getPermissionsByUserId

};
