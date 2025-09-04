/**
 * Utility to handle pagination or lazy loading
 * Supports:
 *   - Pagination (page + limit)
 *   - Lazy loading (lastId + limit)
 *
 * @param {object} params - { page?, limit?, offset?, lastId?, defaultLimit? }
 * @returns {object} - { type, page, limit, offset?, lastId? }
 */
function getPagination(params = {}) {
  const limit = params.limit
    ? parseInt(params.limit.toString().trim(), 10)
    : params.defaultLimit || 2;

  if (params.lastId) {
    const lastId = params.lastId.toString().trim();
    return { type: 'lazy', limit, lastId };
  }

  // Classic pagination
  const page = params.page ? parseInt(params.page.toString().trim(), 10) : 1;

  let offset;
  if (params.offset !== undefined) {
    offset = parseInt(params.offset.toString().trim(), 10);
    if (isNaN(offset) || offset < 0) offset = (page - 1) * limit;
  } else {
    offset = (page - 1) * limit;
  }

  return { type: 'pagination', page, limit, offset };
}

module.exports = { getPagination };
