const jwt = require('jsonwebtoken');

// Generate Access Token
const generateAccessToken = (user) => {
  // include all necessary fields
  const payload = {
    userId: user.userId || user.id,   // userId preferred
    email: user.email || null,
    phone: user.phone || null,
    roles: user.roles || null,        // array or null
    permissions: user.permissions || null, // array or null
    is_active: user.is_active ?? true // default true if missing
  };

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '1h', // short lived
  });
};
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
