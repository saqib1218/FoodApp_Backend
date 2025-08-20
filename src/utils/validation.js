const { body, validationResult } = require('express-validator');


/**
 * Return an array of missing fields (empty array if none).
 * @param {Object} data
 * @param {string[]} requiredFields
 * @returns {string[]} missingFields
 */
function validateRequiredFields(data, requiredFields) {
  if (!data || typeof data !== 'object') {
    // Caller can treat this as all fields missing or handle specially
    return requiredFields.slice();
  }

  const missingFields = requiredFields.filter(field => {
    const v = data[field];
    return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
  });

  return missingFields; // [] if ok
}

/**
 * Validate mobile number. Returns true if valid, false otherwise.
 * Use mobileNumber as parameter name to match your API naming.
 * Example: "+923001234567"
 * @param {string} mobileNumber
 * @returns {boolean}
 */
function validateMobileNumber(mobileNumber) {
  if (typeof mobileNumber !== 'string') return false;
  const s = mobileNumber.trim();
  const regex = /^\+92[3-9][0-9]{9}$/; // Pakistani mobile format +92XXXXXXXXXX
  return regex.test(s);
}

module.exports = {
  validateRequiredFields,
  validateMobileNumber
};






// // User registration validation
// const validateRegistration = [
//   body('name')
//     .trim()
//     .isLength({ min: 2, max: 50 })
//     .withMessage('Name must be between 2 and 50 characters')
//     .matches(/^[a-zA-Z\s]+$/)
//     .withMessage('Name can only contain letters and spaces'),
  
//   body('email')
//     .isEmail()
//     .normalizeEmail()
//     .withMessage('Please provide a valid email address'),
  
//   body('password')
//     .isLength({ min: 6 })
//     .withMessage('Password must be at least 6 characters long')
//     .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
//     .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
  
//   handleFieldValidationErrors
// ];

// // User login validation
// const validateLogin = [
//   body('email')
//     .isEmail()
//     .normalizeEmail()
//     .withMessage('Please provide a valid email address'),
  
//   body('password')
//     .notEmpty()
//     .withMessage('Password is required'),
  
//   handleFieldValidationErrors
// ];

// // User update validation
// const validateUserUpdate = [
//   body('name')
//     .optional()
//     .trim()
//     .isLength({ min: 2, max: 50 })
//     .withMessage('Name must be between 2 and 50 characters')
//     .matches(/^[a-zA-Z\s]+$/)
//     .withMessage('Name can only contain letters and spaces'),
  
//   body('email')
//     .optional()
//     .isEmail()
//     .normalizeEmail()
//     .withMessage('Please provide a valid email address'),
  
//   handleFieldValidationErrors
// ];

// // Password change validation
// const validatePasswordChange = [
//   body('currentPassword')
//     .notEmpty()
//     .withMessage('Current password is required'),
  
//   body('newPassword')
//     .isLength({ min: 6 })
//     .withMessage('New password must be at least 6 characters long')
//     .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
//     .withMessage('New password must contain at least one uppercase letter, one lowercase letter, and one number'),
  
//   handleFieldValidationErrors
// ];

// // Generic ID validation
// const validateId = [
//   body('id')
//     .isUUID()
//     .withMessage('Invalid ID format'),
  
//   handleFieldValidationErrors
// ];
// /**
//  * Checks if a phone number is a valid Pakistani number in +92 format
//  * Example of valid: +923001234567
//  */


// // utils/validation.js

// function validatemobileNumber(mobileNumber, res) {
//   const regex = /^\+92[3-9][0-9]{9}$/;
//   if (!regex.test(mobileNumber)) {
//     res.status(400).json({
//       success: false,
//       error: {
//         code: "INVALID_MOBILE_NUMBER_FORMAT",
//         message: "Invalid mobile number format. Use +92XXXXXXXXXX format"
//       }
//     });
//     return false; // indicate failure
//   }
//   return true; // valid number
// }

// module.exports = {
//   validatemobileNumber,
// };






module.exports = {
  // handleFieldValidationErrors,
  validateRequiredFields,
  // validateRegistration,
  // validateLogin,
  // validateUserUpdate,
  // validatePasswordChange,
  // validateId,
  validateMobileNumber
}; 