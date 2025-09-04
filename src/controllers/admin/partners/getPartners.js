// src/controllers/admin/kitchenController.js
const { pool } = require('../../../config/database');
const { redis } = require('../../../config/redisClient');
const { sendSuccess } = require('../../../utils/responseHelpers');
const logger = require('../../../config/logger');
const { hasAdminPermissions } = require('../../../services/hasAdminPermissions');
const PERMISSIONS = require('../../../config/permissions');
const { getPagination } = require('../../../utils/getPagination'); // ✅ import utility

exports.getPartners = async (req, res, next) => {
  const log = logger.withTrace(req);

  // ✅ Use utility for pagination
  const { page, limit, offset } = getPagination({
    page: req.query.page,
    limit: req.query.limit,
    offset: req.query.offset,
    defaultLimit: 20
  });

  const idsKey = `kitchen_users:ids`;
  const detailsKey = `kitchen_users:details`;
  const totalKey = `kitchen_users:total`;

  const adminUserId = req.user?.userId;
  await hasAdminPermissions(adminUserId, PERMISSIONS.ADMIN.PARTNER.LIST_VIEW);

  log.info({ page, limit, offset }, '[getPartners] request started');

  try {
    let users = [];
    let totalItems = 0;

    // 1️⃣ Try Redis first
    if (redis) {
      try {
        const totalStr = await redis.get(totalKey);
        totalItems = totalStr ? parseInt(totalStr, 10) : await redis.zcard(idsKey);

        if (totalItems > 0) {
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
          ku.id AS user_id,
          ku.kitchen_id,
          ku.name,
          ku.phone AS mobilenumber,
          ku.email,
          ku.bio,
          ku.is_kyc_verified,
          ku.status,
          ku.is_primary_owner,
          ku.date_of_birth,
          ku.gender,
          ku.joined_at,
          ku.relation_to_primary_owner,
          json_build_object(
            'name', kr.name
          ) AS role
        FROM kitchen_users ku
        LEFT JOIN kitchen_user_roles kur ON kur.kitchen_user_id = ku.id
        LEFT JOIN kitchen_roles kr ON kr.id = kur.role_id
        WHERE ku.deleted_at IS NULL
        ORDER BY ku.joined_at DESC
      `;
      const { rows } = await client.query(query);
      users = rows;
      totalItems = users.length;
      log.info({ count: users.length, sample: rows.slice(0, 5) }, 'DB rows fetched with role');

      // 3️⃣ Cache in Redis
      if (redis && users.length > 0) {
        const pipeline = redis.multi();
        pipeline.del(idsKey);
        pipeline.del(detailsKey);
        pipeline.set(totalKey, totalItems);
        users.forEach(u => {
          const score = new Date(u.joined_at).getTime();
          pipeline.zadd(idsKey, score, u.user_id);
          pipeline.hset(detailsKey, u.user_id, JSON.stringify(u));
        });
        await pipeline.exec();
        log.info({ count: users.length }, '✅ Users cached in Redis (with role)');
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
