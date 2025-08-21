const { pool } = require('../../../config/database');
const { validateRequiredFields } = require("../../../utils/validation");
const { sendOtp, generateOtp } = require('../../../utils/Otp');
const { sendSuccess } = require('../../../utils/responseHelpers');
const BusinessError = require('../../../lib/businessErrors');

const MAX_TRIALS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes in ms

exports.resendOtp = async (req, res, next) => {
  try {
    const missing = validateRequiredFields(req.body, ['otp_id']);
    if (missing.length) {
      return next(new BusinessError('MISSING_REQUIRED_FIELDS', {
        details: { fields: missing.map(f => ({ field: f, reason: 'REQUIRED' })) },
        traceId: req.traceId,
      }));
    }

    const { otp_id: otpId } = req.body;

    // Fetch OTP record
    const { rows } = await pool.query(`SELECT * FROM otp_requests WHERE id = $1`, [otpId]);
    const otpRecord = rows[0];

    if (!otpRecord) {
      return next(new BusinessError('OTP_NOT_FOUND', { traceId: req.traceId }));
    }

    const now = new Date();
    const MAX_TRIALS = otpRecord.max_trials || 5;
    const LOCKOUT_MINUTES = 15;

    // Check timeout first
    if (otpRecord.timeout_until_resend && new Date(otpRecord.timeout_until_resend) > now) {
      return next(new BusinessError('OTP_ATTEMPTS_EXCEEDED', {
        message: `Too many attempts. Try again after ${LOCKOUT_MINUTES} minutes.`,
        retry_after_seconds: Math.floor((new Date(otpRecord.timeout_until_resend) - now) / 1000),
        traceId: req.traceId,
        details: {
          meta: {
            otp_id: otpRecord.id,
            resend_trial_count: otpRecord.resend_trial_count,
            timeout_until_resend: otpRecord.timeout_until_resend,
          }
        },
        retryable: true
      }));
    }

    // Check if OTP is still valid
    if (otpRecord.expires_at && new Date(otpRecord.expires_at) > now) {
      return next(new BusinessError('OTP_STILL_VALID', {
        message: 'OTP is still valid. Please wait before requesting a new one.',
        traceId: req.traceId,
        details: {
          meta: {
            otp_id: otpRecord.id,
            resend_trial_count: otpRecord.resend_trial_count,
            timeout_until_resend: otpRecord.timeout_until_resend,
          }
        },
        retryable: true
      }));
    }

    // Increment trial count
    const nextTrialCount = (otpRecord.resend_trial_count || 0) + 1;

    // If max trials reached, set timeout
    let timeoutUntilResend = null;
    if (nextTrialCount > MAX_TRIALS) {
      timeoutUntilResend = new Date(now.getTime() + LOCKOUT_MINUTES * 60 * 1000);
      await pool.query(
        `UPDATE otp_requests SET resend_trial_count = $1, timeout_until_resend = $2 WHERE id = $3`,
        [nextTrialCount, timeoutUntilResend, otpId]
      );

      return next(new BusinessError('OTP_ATTEMPTS_EXCEEDED', {
        message: `Too many attempts. Try again after ${LOCKOUT_MINUTES} minutes.`,
        retry_after_seconds: LOCKOUT_MINUTES * 60,
        traceId: req.traceId,
        details: {
          meta: {
            otp_id: otpRecord.id,
            resend_trial_count: nextTrialCount,
            timeout_until_resend: timeoutUntilResend,
          }
        },
        retryable: true
      }));
    }

    // Generate new OTP and update record with 1-minute expiry
    const newOtpCode = generateOtp();
    const updatedRow = await pool.query(
      `UPDATE otp_requests
       SET otp_code = $1,
           resend_trial_count = $2,
           expires_at = NOW() + INTERVAL '1 minute',
           status = 'resent',
           timeout_until_resend = NULL
       WHERE id = $3
       RETURNING *`,
      [newOtpCode, nextTrialCount, otpId]
    );

    const updatedOtp = updatedRow.rows[0];

    // Send OTP
    sendOtp({ identity: updatedOtp.identity, otp_code: newOtpCode }).catch(console.error);

    const expiresInSeconds = Math.max(0, Math.floor((new Date(updatedOtp.expires_at) - now) / 1000));

    // ✅ Success using catalog entry
    return sendSuccess(res, 'AUTH_OTP_RESENT_SUCCESS', {
      otp_id: updatedOtp.id,
      otp_type: updatedOtp.otp_type,
      status: updatedOtp.status,
      expires_in: expiresInSeconds,
      meta: {
        resend_trial_count: updatedOtp.resend_trial_count,
        timeout_until_resend: updatedOtp.timeout_until_resend
      }
    }, req.traceId);

  } catch (err) {
    console.error('Error in resendOtp:', err);
    return next(err);
  }
};

