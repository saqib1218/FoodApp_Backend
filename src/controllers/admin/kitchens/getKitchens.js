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

    // 2️⃣ Pagination / lazy params
    const { type, limit, offset, lastId } = getPagination(req.query);

    // 3️⃣ Sorting params
    const sortBy = req.query.sortBy || 'created_at';
    const sortOrder = req.query.sortOrder === 'asc' ? 'ASC' : 'DESC';

    let kitchens = [];
    let source = 'db';
    let totalItems = 0;

    // 4️⃣ Try Redis
    if (redis) {
      try {
        let kitchenIds = [];
        if (type === 'pagination') {
          kitchenIds = await redis.zrevrange(idsKey, offset, offset + limit - 1);
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
          totalItems = await redis.zcard(idsKey); // ✅ total count from Redis
          source = 'redis';
        }
      } catch (redisErr) {
        log.error({ redisErr }, '⚠️ Redis fetch failed, fallback to DB');
      }
    }

    // 5️⃣ Fetch from DB if Redis missed
    if (!kitchens.length) {
      const client = await pool.connect();
      try {
        // ✅ get total count
        const countResult = await client.query(`SELECT COUNT(*) FROM ${table}`);
        totalItems = parseInt(countResult.rows[0].count, 10);

        let query = `
          SELECT k.*,
                 ku.id   AS owner_id,
                 ku.name AS owner_name,
                 kr.name AS owner_role
          FROM ${table} k
          LEFT JOIN kitchen_users ku
            ON ku.kitchen_id = k.id AND ku.is_primary_owner = TRUE
          LEFT JOIN kitchen_user_roles kur
            ON kur.kitchen_user_id = ku.id
          LEFT JOIN kitchen_roles kr
            ON kr.id = kur.role_id
        `;
        const params = [];
        let paramIndex = 1;

        if (type === 'lazy' && lastId) {
          query += ` WHERE k.id > $${paramIndex++}`;
          params.push(lastId);
        }

        query += ` ORDER BY k.${sortBy} ${sortOrder} LIMIT $${paramIndex++}`;
        params.push(limit);

        if (type === 'pagination') {
          query += ` OFFSET $${paramIndex++}`;
          params.push(offset);
        }

        const { rows } = await client.query(query, params);

        kitchens = rows.map((k) => {
          const owner = k.owner_id
            ? { id: k.owner_id, name: k.owner_name, role: k.owner_role || 'owner' }
            : {};
          const { owner_id, owner_name, owner_role, ...rest } = k;
          return { ...rest, owner };
        });

        // ✅ Cache in Redis
        if (redis && kitchens.length) {
          const pipeline = redis.multi();
          kitchens.forEach((kitchen) => {
            const kitchenId = kitchen.id;
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

    // 6️⃣ Meta
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
