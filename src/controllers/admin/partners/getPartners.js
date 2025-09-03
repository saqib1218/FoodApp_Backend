// src/controllers/admin/kitchenController.js
const { pool } = require('../../../config/database');
const { redis } = require('../../../config/redisClient');
const { sendSuccess } = require('../../../utils/responseHelpers');
const logger = require('../../../config/logger');
const { hasAdminPermissions } = require('../../../services/hasAdminPermissions');
const PERMISSIONS = require('../../../config/permissions');

exports.getPartners = async (req, res, next) => {
  const log = logger.withTrace(req);

  // Pagination query params
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;

  const idsKey = `kitchen_users:ids`;
  const detailsKey = `kitchen_users:details`;

  const adminUserId = req.user?.userId;
  await hasAdminPermissions(adminUserId, PERMISSIONS.ADMIN.PARTNER.DETAIL_VIEW);

  log.info({ page, limit }, '[getPartners] request started');

  try {
    let users = [];
    let totalItems = 0;

    // 1️⃣ Try Redis first
    if (redis) {
      try {
        totalItems = await redis.zcard(idsKey);
        if (totalItems > 0) {
          // Get IDs newest first
          const userIds = await redis.zrevrange(idsKey, offset, offset + limit - 1);
          if (userIds.length) {
            const userDetails = await redis.hmget(detailsKey, userIds);
            users = userDetails.map(u => JSON.parse(u));
            log.info({ count: users.length }, '✅ Users fetched from Redis (pagination)');
            return sendSuccess(res, 'USER.USERS_FETCHED', users, {
              pagination: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) },
              sorting: { field: 'joined_at', order: 'DESC' },
              source: 'redis'
            });
          }
        }
        log.info('⚠️ Redis miss, fetching from DB');
      } catch (redisErr) {
        log.error({ redisErr }, '⚠️ Redis fetch failed, falling back to DB');
      }
    }

    // 2️⃣ Fetch from PostgreSQL
    const client = await pool.connect();
    try {
      const query = `
        SELECT 
          id AS user_id,
          kitchen_id,
          name,
          phone AS mobilenumber,
          email,
          bio,
          is_kyc_verified,
          status,
          is_primary_owner,
          date_of_birth,
          gender,
          joined_at,
          relation_to_primary_owner
        FROM kitchen_users
        WHERE deleted_at IS NULL
        ORDER BY joined_at DESC
      `;
      const { rows } = await client.query(query);
      users = rows;
      totalItems = users.length;
      log.info({ count: users.length, sample: rows.slice(0, 5) }, 'DB rows fetched');

      // 3️⃣ Cache in Redis (ids + details)
      if (redis && users.length > 0) {
        const pipeline = redis.multi();
        pipeline.del(idsKey);
        pipeline.del(detailsKey);
        users.forEach(u => {
          const score = new Date(u.joined_at).getTime();
          pipeline.zadd(idsKey, score, u.user_id);
          pipeline.hset(detailsKey, u.user_id, JSON.stringify(u));
        });
        await pipeline.exec();
        log.info({ count: users.length }, '✅ Users cached in Redis (ids + details)');
      }

      // 4️⃣ Return paginated slice
      const paginatedUsers = users.slice(offset, offset + limit);
      return sendSuccess(res, 'USER.USERS_FETCHED', paginatedUsers, {
        pagination: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) },
        sorting: { field: 'joined_at', order: 'DESC' },
        source: 'db'
      });
    } finally {
      client.release();
      log.debug('DB client released');
    }
  } catch (err) {
    log.error({ err }, '❌ Error fetching kitchen users');
    return next(err);
  }
};
