const { pool } = require('../../../config/database');
const { sendSuccess } = require('../../../utils/responseHelpers');
const BusinessError = require('../../../lib/businessErrors');
const logger = require('../../../config/logger');
const { hasAdminPermissions } = require('../../../services/hasAdminPermissions');
const PERMISSIONS = require('../../../config/permissions');

exports.getKitchenAvailabilityById = async (req, res, next) => {
  const log = logger.withTrace(req);
  const kitchenId = req.params.kitchenId; // this is kitchen_id from URL
  const adminUserId = req.user?.userId;
  const state =req.query.state === 'staging' || req.query.status === 'DRAFT'
      ? 'staging'
      : 'main';
  const redisKey = `kitchen:${kitchenId}:availability:${state}`;

  await hasAdminPermissions(
    adminUserId,
    PERMISSIONS.ADMIN.KITCHEN.AVAILABILITY_VIEW
  );

  if (!kitchenId) {
    log.warn('No kitchenId provided');
    return next(
      new BusinessError('COMMON.MISSING_REQUIRED_FIELDS', {
        traceId: req.traceId,
        details: {
          fields: [{ field: 'KitchenId', meta: { reason: 'required' } }],
        },
      })
    );
  }

  try {
    log.info(
      { kitchenId, state, redisKey },
      '[getKitchenAvailabilityById] request started'
    );

    const client = await pool.connect();
    try {
      let query;
      let params = [kitchenId];

      if (state === 'staging') {
        query = `
          SELECT 
            ka.id,
            ks.kitchen_id, -- ✅ real kitchen_id from kitchens_staging
            ka.day_of_week_id,
            d.name AS day_name,
            ka.slot_id,
            s.name AS slot_name,
            s.label_key AS slot_label,
            s.default_start_time AS slot_default_start_time,
            s.default_end_time AS slot_default_end_time,
            ka.is_available,
            ka.custom_start_time,
            ka.custom_end_time,
            ka.status,
            ka.created_at,
            ka.updated_at
          FROM kitchen_availability_staging ka
          JOIN kitchens_staging ks ON ka.kitchen_staging_id = ks.id
          LEFT JOIN days_of_week d ON ka.day_of_week_id = d.id
          LEFT JOIN kitchen_availability_slots s ON ka.slot_id = s.id
          WHERE ks.kitchen_id = $1
          ${req.query.status === 'DRAFT' ? "AND ka.status = 'DRAFT'" : ''}
          ORDER BY ka.day_of_week_id, ka.slot_id
        `;
      } else {
        query = `
          SELECT 
            ka.id,
            ka.kitchen_id,
            ka.day_of_week_id,
            d.name AS day_name,
            ka.slot_id,
            s.name AS slot_name,
            s.label_key AS slot_label,
            s.default_start_time AS slot_default_start_time,
            s.default_end_time AS slot_default_end_time,
            ka.is_available,
            ka.custom_start_time,
            ka.custom_end_time,
            ka.status,
            ka.created_at,
            ka.updated_at
          FROM kitchen_availability ka
          LEFT JOIN days_of_week d ON ka.day_of_week_id = d.id
          LEFT JOIN kitchen_availability_slots s ON ka.slot_id = s.id
          WHERE ka.kitchen_id = $1
          ORDER BY ka.day_of_week_id, ka.slot_id
        `;
      }

      log.info({ query, params }, 'Executing SQL query');

      const { rows } = await client.query(query, params);
      log.info(
        { count: rows.length, sample: rows.slice(0, 5) },
        'DB rows fetched'
      );

      if (!rows.length) {
        log.info(
          `No availability found for kitchen ${kitchenId} with state ${state}`
        );
        return sendSuccess(
          res,
          'KITCHEN.AVAILABILITY_FETCHED',
          [],
          req.traceId
        );
      }

      // Transform response → nested clean structure
      const availability = rows.map((r) => ({
        id: r.id,
        kitchen_id: r.kitchen_id,
        day: {
          id: r.day_of_week_id,
          name: r.day_name,
        },
        slot: {
          id: r.slot_id,
          name: r.slot_name,
          label: r.slot_label,
          default_start_time: r.slot_default_start_time,
          default_end_time: r.slot_default_end_time,
        },
        is_available: r.is_available,
        custom_start_time: r.custom_start_time,
        custom_end_time: r.custom_end_time,
        status: r.status,
        created_at: r.created_at,
        updated_at: r.updated_at,
      }));

      return sendSuccess(
        res,
        'KITCHEN.AVAILABILITY_FETCHED',
        availability,
        req.traceId
      );
    } finally {
      client.release();
      log.debug('DB client released');
    }
  } catch (err) {
    log.error({ err }, '❌ Error fetching kitchen availability');
    return next(err);
  }
};
