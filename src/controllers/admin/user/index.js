const createUserController = require('./createUserController');
const editUserController = require('./editUserController');
const updateUserStatusController = require('./updateUserStatusController');
const deleteUserController = require('./deleteUserController');
const getUsersController = require('./getUsersController');
const getUserById= require('./getUserByIdController'); // ✅ new

module.exports = {
  ...createUserController,
  ...editUserController,
  ...updateUserStatusController,
  ...deleteUserController,
  ...getUsersController,
  ...getUserById // ✅ include here
};
