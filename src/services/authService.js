const pool = require("../config/database");
const { verifyToken, generateAccessToken } = require("../utils/jwt");
const BusinessError = require("../lib/businessErrors");
const { sendSuccess } = require("../utils/responseHelpers");

exports.refreshToken = async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.refreshToken;

    // 1️⃣ No refresh token provided
    if (!refreshToken) {
      throw new BusinessError("AUTH.AUTH_REQUIRED", { traceId: req.traceId });
    }

    let decoded;
    try {
      // 2️⃣ Verify refresh token
      decoded = verifyToken(
        refreshToken,
        process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET
      );
    } catch (err) {
      throw new BusinessError("AUTH.TOKEN_INVALID", { traceId: req.traceId });
    }

    // 3️⃣ Check DB (revocation support)
    const check = await pool.query(
      "SELECT * FROM admin_refresh_tokens WHERE token = $1",
      [refreshToken]
    );
    if (check.rows.length === 0) {
      throw new BusinessError("AUTH.TOKEN_EXPIRED", { traceId: req.traceId });
    }

    // 4️⃣ Issue new access token
    const user = {
      id: decoded.userId || decoded.user_id || decoded.id,
      phone: decoded.phone || null,
    };
    const accessToken = generateAccessToken(user);

    // 5️⃣ Success response
    return sendSuccess(
      res,
      "AUTH.ACCESS_TOKEN_REFRESHED",
      {
        access_token: accessToken,
        access_token_expires_in: 3600, // seconds
      },
      req.traceId
    );
  } catch (error) {
    return next(error);
  }
};
