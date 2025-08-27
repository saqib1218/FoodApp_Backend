// controllers/admin/user/index.js

const createRoleController = require('./createRoleController');
const editRoleController = require('./editRoleController');
const deleteRoleController = require('./deleteRoleController');
const getRolesController=require('./getRolesController');
const getRolesByUserId=require('./getRolesByUserIdController')
const getRolesById=require('./getRoleByIdController')

module.exports = {
  ...createRoleController,
  ...editRoleController,
  ...deleteRoleController,
  ...getRolesController,
  ...getRolesByUserId,
  ...getRolesById

};
