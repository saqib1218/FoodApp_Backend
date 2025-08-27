// controllers/admin/user/index.js

const createPermissionController = require('./createPermissionController');
const editPermissionController = require('./editPermissionController');
const getPermissionsController=require('./getPermissionsController')
const getPermissionsByUserId=require('./getPermissionsByUserIdController')
const getPermissionsById=require('./getPermissionByIdController')
const deletePermission=require('./deletePermission')


module.exports = {
  ...createPermissionController,
  ...editPermissionController,
  ...getPermissionsController,
  ...getPermissionsByUserId,
  ...getPermissionsById,
  ...deletePermission

};
