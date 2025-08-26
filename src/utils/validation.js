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
 * Pakistani mobile format: +92XXXXXXXXXX
 * @param {string} mobileNumber
 * @returns {boolean}
 */
function validateMobileNumber(mobileNumber) {
  if (typeof mobileNumber !== 'string') return false;
  const s = mobileNumber.trim();
  const regex = /^\+92[3-9][0-9]{9}$/;
  return regex.test(s);
}

/**
 * Validate email format. Returns true if valid, false otherwise.
 * Example: "user@example.com"
 * @param {string} email
 * @returns {boolean}
 */
function validateEmail(email) {
  if (typeof email !== 'string') return false;
  const s = email.trim();
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // simple email validation
  return regex.test(s);
}

module.exports = {
  validateRequiredFields,
  validateMobileNumber,
  validateEmail
};










