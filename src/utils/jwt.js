const jwt = require('jsonwebtoken');

// Generate Access Token
const generateAccessToken = (user) => {
  const payload = {
    userId: user.userId || user.user_id || user.id,  // ✅ handle all cases
    name: user.name || null,
    email: user.email || null,
    mobileNumber: user.mobileNumber || user.mobile_number || user.phone || null,
    role: user.role || null,
    isActive: user.isActive ?? user.is_active ?? true
  };

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
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

// ✅ Export everything only once
module.exports = {
  generateAccessToken,
  generateRefreshToken,
  generateTokens,
  verifyToken,
  decodeToken,
  isTokenExpired
};
