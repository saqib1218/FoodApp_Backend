const { pool } = require('../../../config/database');
const { redis } = require('../../../config/redisClient');
const { sendSuccess } = require('../../../utils/responseHelpers');
const logger = require('../../../config/logger');
const { hasAdminPermissions } = require('../../../services/hasAdminPermissions');
const { getPagination } = require('../../../utils/getPagination');
const PERMISSIONS = require('../../../config/permissions');

exports.getKitchens = async (req, res, next) => {
  const log = logger.withTrace(req);
  const adminUserId = req.user?.userId;
  await hasAdminPermissions(adminUserId, PERMISSIONS.ADMIN.KITCHEN.LIST_VIEW);
  try {
    // 1️⃣ Determine state
    const state = req.query.state === 'staging' ? 'staging' : 'main';
    const idsKey = state === 'staging' ? 'kitchens_staging:ids' : 'kitchens_main:ids';
    const detailsKey = state === 'staging' ? 'kitchens_staging:details' : 'kitchens_main:details';
    const table = state === 'staging' ? 'kitchens_staging' : 'kitchens';

    log.info({ state, query: req.query }, '[getKitchens] request started');

 
   

    // 3️⃣ Pagination / lazy params
    const { type, limit, offset, lastId } = getPagination(req.query);

    // 4️⃣ Sorting params from request, default descending by created_at
    const sortBy = req.query.sortBy || 'created_at';
    const sortOrder = req.query.sortOrder === 'asc' ? 'ASC' : 'DESC';

    let kitchens = [];
    let source = 'db'; // default source

    // 5️⃣ Try fetching from Redis
    if (redis) {
      try {
        let kitchenIds = [];
        if (type === 'pagination') {
          kitchenIds = await redis.zrevrange(idsKey, offset, offset + limit - 1); // descending
        } else if (type === 'lazy' && lastId) {
          const startIndex = await redis.zrank(idsKey, lastId);
          if (startIndex !== null) {
            kitchenIds = await redis.zrevrange(idsKey, startIndex + 1, startIndex + limit);
          }
        } else {
          kitchenIds = await redis.zrevrange(idsKey, 0, limit - 1);
        }

        if (kitchenIds.length) {
          const kitchensData = await redis.hmget(detailsKey, kitchenIds);
          kitchens = kitchensData.map((k) => JSON.parse(k));
          source = 'redis';
        }
      } catch (redisErr) {
        log.error({ redisErr }, '⚠️ Redis fetch failed, fallback to DB');
      }
    }

    // 6️⃣ Fetch from DB if Redis missed or failed
    if (!kitchens.length) {
      const client = await pool.connect();
      try {
        let query = `SELECT * FROM ${table}`;
        const params = [];
        let paramIndex = 1;

        if (type === 'lazy' && lastId) {
          query += ` WHERE kitchen_id > $${paramIndex++}`;
          params.push(lastId);
        }

        query += ` ORDER BY ${sortBy} ${sortOrder} LIMIT $${paramIndex++}`;
        params.push(limit);

        if (type === 'pagination') {
          query += ` OFFSET $${paramIndex++}`;
          params.push(offset);
        }

        const { rows } = await client.query(query, params);
        kitchens = rows;

        // Cache in Redis
        if (redis && kitchens.length) {
          const pipeline = redis.multi();
          kitchens.forEach((kitchen) => {
            const kitchenId = kitchen.kitchen_id || kitchen.id;
            const score = new Date(kitchen.created_at).getTime();
            pipeline.zadd(idsKey, score, kitchenId);
            pipeline.hset(detailsKey, kitchenId, JSON.stringify(kitchen));
          });
          await pipeline.exec();
        }
      } finally {
        client.release();
      }
    }

    // 7️⃣ Build meta
    const totalItems = kitchens.length; // can replace with a count query if you want total across DB
    const totalPages = Math.ceil(totalItems / limit) || 1;

    const meta = {
      pagination: {
        page: req.query.page || 1,
        limit,
        offset,
        type,
        lastId,
        totalItems,
        totalPages
      },
      sorting: {
        field: sortBy,
        order: sortOrder
      },
      source
    };

    return sendSuccess(res, 'KITCHEN.KITCHENS_FETCHED', kitchens, meta);

  } catch (err) {
    log.error({ err }, '❌ Error fetching kitchens');
    return next(err);
  }
};
