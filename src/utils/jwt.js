const jwt = require('jsonwebtoken');


const generateAccessToken = (user) => {
  const payload = {
    userId: user.user_id || user.id,
    name: user.name || null,
    email: user.email || null,
    mobileNumber: user.mobile_number || user.phone || null, // ✅ mobileNumber (camelCase)
    role: user.role || null,   // single role
    isActive: user.is_active ?? true // ✅ camelCase
  };

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  });
};

module.exports = { generateAccessToken };


module.exports = { generateAccessToken };

// Generate Refresh Token
const generateRefreshToken = (user) => {
  const payload = { user_id: user.id };

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d', // long lived
  });
};

// Verify Token (access/refresh)
const verifyToken = (token, secret) => {
  try {
    return jwt.verify(token, secret);
  } catch (error) {
    throw error;
  }
};

// Decode token without verification (for payload only)
const decodeToken = (token) => {
  try {
    return jwt.decode(token);
  } catch (error) {
    throw error;
  }
};

// Check if token is expired
const isTokenExpired = (token) => {
  try {
    const decoded = jwt.decode(token);
    if (!decoded || !decoded.exp) return true;
    return Date.now() >= decoded.exp * 1000;
  } catch (error) {
    return true;
  }
};

// Generate both tokens together
const generateTokens = (user) => {
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  return { accessToken, refreshToken };
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  generateTokens,
  verifyToken,
  decodeToken,
  isTokenExpired
};
