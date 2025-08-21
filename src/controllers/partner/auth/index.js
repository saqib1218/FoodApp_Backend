
const signupController = require('./signupController');
const otpController = require('./otpController');
const loginController=require("./loginController");
const chefSignupValidation=require('./chefController')
const updateChefProfile=require('./chefController')

module.exports = {
  ...signupController,
  ...otpController,
  ...loginController,
  ...chefSignupValidation,
  ...updateChefProfile
};