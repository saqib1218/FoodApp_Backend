


const { pool } = require('../config/database');

const MAX_VERIFY_TRIALS = 5;
// Generates a 4-digit OTP
function generateOtp() {
  return Math.floor(1000 + Math.random() * 9000).toString(); // ensures 4-digit code
}

// OTP save function with trial increment on every failure
const saveOtp = async ({ identity, otpType, expiresInMinutes = 1 }) => {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + expiresInMinutes * 60000);
  const maxTrials = 5;
  const lockoutMinutes = 15;

  const columnMap = {
    signup: { trial: 'signup_trial_count', timeout: 'timeout_until_signup' },
    verify: { trial: 'verify_trial_count', timeout: 'timeout_until_verify' },
    resend: { trial: 'resend_trial_count', timeout: 'timeout_until_resend' }
  };

  const columns = columnMap[otpType];
  if (!columns) return { success: false, error: 'Invalid OTP type' };

  try {
    const { rows } = await pool.query(`
      SELECT *
      FROM otp_requests
      WHERE identity = $1 AND otp_type = $2
      ORDER BY created_at DESC
      LIMIT 1
    `, [identity, otpType]);

    const existing = rows[0];

    // No existing OTP → create new one
    if (!existing) {
      const otp_code = generateOtp();
      const result = await pool.query(`
        INSERT INTO otp_requests
          (identity, otp_code, otp_type, status, ${columns.trial}, max_trials, expires_at, created_at, updated_at)
        VALUES ($1, $2, $3, 'pending', 1, $4, $5, NOW(), NOW())
        RETURNING *
      `, [identity, otp_code, otpType, maxTrials, expiresAt]);

      return { success: true, data: result.rows[0], new_otp: otp_code };
    }

    // Increment trial count
    const updatedTrial = (existing[columns.trial] || 0) + 1;

    // Check max trials
    if (updatedTrial > maxTrials) {
      const lockoutUntil = new Date(now.getTime() + lockoutMinutes * 60000);
      await pool.query(`
        UPDATE otp_requests
        SET ${columns.trial} = $1,
            ${columns.timeout} = $2
        WHERE id = $3
      `, [updatedTrial, lockoutUntil, existing.id]);

      return {
        success: false,
        reason: 'OTP_ATTEMPTS_EXCEEDED',
        error: 'OTP attempts exceeded. Please try again later.',
        retry_after_seconds: lockoutMinutes * 60,
        meta: {
          otp_id: existing.id,
          otp_type: existing.otp_type,
          [columns.trial]: updatedTrial,
          [columns.timeout]: lockoutUntil,
        }
      };
    }

    // OTP still valid → increment trial count but do not generate new OTP
    if (existing.expires_at && new Date(existing.expires_at) > now) {
      await pool.query(`
        UPDATE otp_requests
        SET ${columns.trial} = $1,
            updated_at = NOW()
        WHERE id = $2
      `, [updatedTrial, existing.id]);

      const expiresInSeconds = Math.floor((new Date(existing.expires_at) - now) / 1000);
      return {
        success: false,
        reason: 'OTP_STILL_VALID',
        meta: {
          otp_id: existing.id,
          otp_type: existing.otp_type,
          [columns.trial]: updatedTrial,
          expires_in: expiresInSeconds,
          max_trials: existing.max_trials,
          status: existing.status,
        },
        retry_after_seconds: expiresInSeconds
      };
    }

    // Otherwise generate new OTP
    const otp_code = generateOtp();
    const result = await pool.query(`
      UPDATE otp_requests
      SET otp_code = $1,
          status = 'pending',
          ${columns.trial} = $2,
          expires_at = $3,
          updated_at = NOW()
      WHERE id = $4
      RETURNING *
    `, [otp_code, updatedTrial, expiresAt, existing.id]);

    return { success: true, data: result.rows[0], new_otp: otp_code };

  } catch (err) {
    return { success: false, error: 'Internal server error' };
  }
};





async function sendOtp({ identity, otp_code }) {
 



  return {
    success: true,
    message: 'OTP sent successfully',

  };
}

async function getLatestOtpEntry({ identity, otpType }) {
  const client = await pool.connect();

  try {
    const query = `
      SELECT * FROM otp_requests
      WHERE identity = $1 AND otp_type = $2
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const values = [identity, otpType];
    const { rows } = await client.query(query, values);

    return rows[0] || null;
  } catch (error) {
    console.error('Error getting latest OTP entry:', error);
    throw error;
  } finally {
    client.release();
  }
}





const verifyOtp = async ({ otp_id, otp_code }) => {
  try {
    // 1️⃣ Fetch OTP record
    const { rows } = await pool.query(
      `SELECT * FROM otp_requests WHERE id = $1`,
      [otp_id]
    );
    const otpRecord = rows[0];

    if (!otpRecord) {
      return { success: false, reason: 'OTP_NOT_FOUND', error: 'OTP record not found.' };
    }

    const now = new Date();

    // 2️⃣ Check lockout
    if (otpRecord.timeout_until_verify && new Date(otpRecord.timeout_until_verify) > now) {
      const retryAfter = Math.ceil((new Date(otpRecord.timeout_until_verify) - now) / 1000);
      return {
        success: false,
        reason: 'TOO_MANY_ATTEMPTS',
        error: `Max verification attempts reached.`,
        meta: {
          retry_after_seconds: retryAfter,
          verify_trial_count: otpRecord.verify_trial_count,
          timeout_until_verify: otpRecord.timeout_until_verify
        }
      };
    }

    // 3️⃣ Increment trial
    let updatedTrial = (otpRecord.verify_trial_count || 0) + 1;

    // 4️⃣ Check expiration
    if (otpRecord.expires_at && new Date(otpRecord.expires_at) < now) {
      await pool.query(
        `UPDATE otp_requests
         SET verify_trial_count = $1
         WHERE id = $2`,
        [updatedTrial, otp_id]
      );

      return {
        success: false,
        reason: 'OTP_EXPIRED',
        error: 'OTP has expired.',
        meta: { verify_trial_count: updatedTrial }
      };
    }

    // 5️⃣ Wrong OTP
    if (otpRecord.otp_code !== otp_code) {
      let timeout = null;

      if (updatedTrial >= MAX_VERIFY_TRIALS) {
        timeout = new Date(now.getTime() + 15 * 60 * 1000); // 15 min lockout
      }

      await pool.query(
        `UPDATE otp_requests
         SET verify_trial_count = $1, timeout_until_verify = $2
         WHERE id = $3`,
        [updatedTrial, timeout, otp_id]
      );

      return {
        success: false,
        reason: updatedTrial >= MAX_VERIFY_TRIALS ? 'ATTEMPTS_EXCEEDED' : 'WRONG_CODE',
        error: 'Incorrect OTP code.',
        meta: {
          verify_trial_count: updatedTrial,
          timeout_until_verify: timeout,
          retry_after_seconds: timeout ? 15 * 60 : 0
        }
      };
    }

    // 6️⃣ Correct OTP → reset trials & mark verified
    await pool.query(
      `UPDATE otp_requests
       SET verified_at = $1,
           status = 'verified',
           verify_trial_count = 0,
           timeout_until_verify = NULL
       WHERE id = $2`,
      [now, otp_id]
    );

    otpRecord.verified_at = now.toISOString();
    otpRecord.status = 'verified';
    otpRecord.verify_trial_count = 0;
    otpRecord.timeout_until_verify = null;

    return {
      success: true,
      data: otpRecord,
      meta: { verify_trial_count: updatedTrial }
    };

  } catch (error) {
    // Removed console.error to avoid logging sensitive info
    return { success: false, reason: 'SERVER_ERROR', error: 'Internal server error.' };
  }
};




module.exports = {
  generateOtp,
  sendOtp,
  saveOtp,
  getLatestOtpEntry,
  verifyOtp
};
