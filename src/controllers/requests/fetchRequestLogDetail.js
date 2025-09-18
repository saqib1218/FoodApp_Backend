const { pool } = require('../../config/database');
const BusinessError = require('../../lib/businessErrors');
const { sendSuccess } = require('../../utils/responseHelpers');
const logger = require('../../config/logger');
const { hasAdminPermissions } = require('../../services/hasAdminPermissions');
const PERMISSIONS = require('../../config/permissions');

/**
 * Fetch details of a change request, including main and staging records
 */
exports.fetchRequestLogDetail = async (req, res, next) => {
  const client = await pool.connect();
  const log = logger.withTrace(req);

  try {
    const adminUserId = req.user?.userId;
    const requestId = req.params.requestId;
     await hasAdminPermissions(adminUserId, PERMISSIONS.ADMIN.REQUEST.DETAIL_VIEW);

    if (!requestId) {
      throw new BusinessError('COMMON.MISSING_REQUIRED_FIELDS', {
        traceId: req.traceId,
        details: { fields: ['requestId'] },
      });
    }

    log.info({ requestId }, '[fetchRequestLogDetail] Fetching change request');

    const { rows } = await client.query(
      `SELECT * FROM change_requests WHERE id = $1`,
      [requestId]
    );

    if (!rows.length) {
      throw new BusinessError('REQUEST.NOT_FOUND', {
        traceId: req.traceId,
        details: { entity: 'change_requests', id: requestId },
      });
    }

    const changeRequest = rows[0];
    let mainRecord = [];
    let stagingRecord = [];

    // === Helper function for kitchen sub-entities ===
    const fetchKitchenSubEntity = async (subTable, subEntityId) => {
      const stagingSubTable = `${subTable}_staging`;
      const stagingFkColumn = 'kitchen_staging_id';

      // Sub-entity primary key in its table
       
        subTable === 'kitchen_addresses'
          ? 'kitchen_address_id'
          : subTable === 'kitchen_availability'
          ? 'kitchen_availability_id'
          : `${subTable}_id`;

      // Main record
      let mainRows = [];
      if (subEntityId) {
        const { rows: subRows } = await client.query(
          `SELECT * FROM ${subTable} WHERE id = $1 ORDER BY created_at DESC`,
          [subEntityId]
        );
        mainRows = subRows || [];
      } else {
        const { rows: subRows } = await client.query(
          `SELECT * FROM ${subTable} WHERE kitchen_id = $1 ORDER BY created_at DESC`,
          [changeRequest.entity_id]
        );
        mainRows = subRows || [];
      }

      // Parent staging
      const { rows: parentStagingRows } = await client.query(
        `SELECT * FROM kitchens_staging WHERE kitchen_id = $1 ORDER BY created_at DESC`,
        [changeRequest.entity_id]
      );
      const parentStagingId = parentStagingRows[0]?.id || null;

      let stagingRows = [];
      if (parentStagingId) {
        let subQuery = `SELECT * FROM ${stagingSubTable} WHERE ${stagingFkColumn} = $1`;
        const params = [parentStagingId];
        if (subEntityId) {
          subQuery += ` AND ${subEntityFkColumn} = $2`;
          params.push(subEntityId);
        }
        subQuery += ' ORDER BY created_at DESC';
        const { rows: subStagingRows } = await client.query(subQuery, params);
        stagingRows = subStagingRows || [];
      }

      return { mainRows, stagingRows };
    };

    // === Fetching logic ===
    if (changeRequest.sub_entity_name) {
      if (
        changeRequest.sub_entity_name === 'kitchen_addresses' ||
        changeRequest.sub_entity_name === 'kitchen_availability'
      ) {
        const { mainRows, stagingRows } = await fetchKitchenSubEntity(
          changeRequest.sub_entity_name,
          changeRequest.sub_entity_id
        );
        mainRecord = mainRows;
        stagingRecord = stagingRows;
      } else {
        // Generic sub-entity (not kitchen)
        const entityFkColumn =
          changeRequest.entity_name === 'kitchens'
            ? 'kitchen_id'
            : `${changeRequest.entity_name}_id`;
        const subEntityFkColumn = `${changeRequest.sub_entity_name}_id`;

        // Main record
        const { rows: subRows } = await client.query(
          changeRequest.sub_entity_id
            ? `SELECT * FROM ${changeRequest.sub_entity_name} WHERE id = $1 ORDER BY created_at DESC`
            : `SELECT * FROM ${changeRequest.sub_entity_name} WHERE ${entityFkColumn} = $1 ORDER BY created_at DESC`,
          changeRequest.sub_entity_id ? [changeRequest.sub_entity_id] : [changeRequest.entity_id]
        );
        mainRecord = subRows || [];

        // Staging
        const stagingSubTable = `${changeRequest.sub_entity_name}_staging`;
        const { rows: subStagingRows } = await client.query(
          `SELECT * FROM ${stagingSubTable} WHERE ${entityFkColumn}_staging_id = $1 ORDER BY created_at DESC`,
          [changeRequest.entity_id]
        );
        stagingRecord = subStagingRows || [];
      }
    } else {
      // No sub-entity → fetch main + staging
      const { rows: entityRows } = await client.query(
        `SELECT * FROM ${changeRequest.entity_name} WHERE id = $1 ORDER BY created_at DESC`,
        [changeRequest.entity_id]
      );
      mainRecord = entityRows || [];

      if (changeRequest.entity_name === 'kitchens') {
        const { rows: kitchensStagingRows } = await client.query(
          `SELECT * FROM kitchens_staging WHERE kitchen_id = $1 ORDER BY created_at DESC`,
          [changeRequest.entity_id]
        );
        stagingRecord = kitchensStagingRows || [];
      }
    }

    return sendSuccess(
      res,
      'REQUEST.DETAIL_FETCHED',
      {
        ...changeRequest,
        mainRecord,
        stagingRecord,
        requestedByAdmin: adminUserId,
      },
      req.traceId
    );
  } catch (err) {
    log.error({ err }, '[fetchRequestLogDetail] Error fetching request detail');
    return next(err);
  } finally {
    client.release();
    log.debug({}, '[fetchRequestLogDetail] DB client released');
  }
};
 