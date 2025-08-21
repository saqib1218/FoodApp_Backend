const loginController = require('./loginController');
const signupSuperAdmin = require('./signupController');

module.exports = {
  ...loginController,
  ...signupSuperAdmin,
};
