const { pool } = require('../../config/database');
const BusinessError = require('../../lib/businessErrors');
const { sendSuccess } = require('../../utils/responseHelpers');
const { hasAdminPermissions } = require('../../services/hasAdminPermissions');
const PERMISSIONS = require('../../config/permissions');
const logger = require('../../config/logger');
const { getPagination } = require('../../utils/getPagination');

exports.getRequestLogs = async (req, res, next) => {
  const client = await pool.connect();
  const log = logger.withTrace(req);

  try {
    const adminUserId = req.user?.userId;
    await hasAdminPermissions(adminUserId, PERMISSIONS.ADMIN.REQUEST.LIST_VIEW);

    log.info({ adminUserId }, '[getRequestLogs] Fetching change requests');

    // ✅ Pagination params
    const { page, limit, offset, type, lastId } = getPagination({
      page: req.query.page,
      limit: req.query.limit,
      offset: req.query.offset,
      lastId: req.query.lastId,
      defaultLimit: 20,
    });

    // ✅ Sorting params
    const sortBy = req.query.sortBy || 'created_at';
    const sortOrder = req.query.sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    let rows = [];
    let totalCount = null;
    let source = 'db'; // default (later redis logic laga sako)

    if (type === 'lazy') {
      const query = `
        SELECT
          id,
          requested_by,
          requested_by_role,
          entity_name,
          entity_id,
          sub_entity_name,
          sub_entity_id,
          action,
          workflow_id,
          reason,
          status,
          reviewed_by,
          reviewed_at,
          created_at,
          updated_at
        FROM change_requests
        WHERE id < $1
        ORDER BY ${sortBy} ${sortOrder}
        LIMIT $2
      `;
      const result = await client.query(query, [lastId, limit]);
      rows = result.rows;
    } else {
      const query = `
        SELECT
          id,
          requested_by,
          requested_by_role,
          entity_name,
          entity_id,
          sub_entity_name,
          sub_entity_id,
          action,
          workflow_id,
          reason,
          status,
          reviewed_by,
          reviewed_at,
          created_at,
          updated_at
        FROM change_requests
        ORDER BY ${sortBy} ${sortOrder}
        LIMIT $1 OFFSET $2
      `;
      const result = await client.query(query, [limit, offset]);
      rows = result.rows;

      const countResult = await client.query(`SELECT COUNT(*) FROM change_requests`);
      totalCount = parseInt(countResult.rows[0].count, 10);
    }

    // ✅ Transform to camelCase
    const data = rows.map(r => ({
      id: r.id,
      requestedBy: r.requested_by,
      requestedByRole: r.requested_by_role,
      entityName: r.entity_name,
      entityId: r.entity_id,
      subEntityName: r.sub_entity_name,
      subEntityId: r.sub_entity_id,
      action: r.action,
      workflowId: r.workflow_id,
      reason: r.reason,
      status: r.status,
      reviewedBy: r.reviewed_by,
      reviewedAt: r.reviewed_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));

    // ✅ Meta
    const meta = {
      pagination: {
        page,
        limit,
        offset,
        type,
        lastId,
        totalItems: totalCount,
        totalPages: totalCount ? Math.ceil(totalCount / limit) : null,
      },
      sorting: {
        field: sortBy,
        order: sortOrder,
      },
      source,
    };

    return sendSuccess(res, 'REQUEST.LIST_FETCHED', data, meta, req.traceId);

  } catch (err) {
    log.error({ err }, '[getRequestLogs] ❌ Error fetching change requests');
    return next(err);
  } finally {
    client.release();
    log.debug({}, '[getRequestLogs] DB client released');
  }
};
