/**
 * Utility to handle pagination or lazy loading
 * @param {object} params - { page, limit, offset, lastId, defaultLimit }
 * @returns {object} - { type, limit, offset?, lastId? }
 */
function getPagination(params) {
  const limit = params.limit ? parseInt(params.limit.toString().trim(), 10) : params.defaultLimit || 20;

  if (params.lastId) {
    const lastId = params.lastId.toString().trim();
    return { type: 'lazy', limit, lastId };
  } else {
    // Classic pagination
    const page = params.page ? parseInt(params.page.toString().trim(), 10) : 1;
    let offset;

    if (params.offset !== undefined) {
      offset = parseInt(params.offset.toString().trim(), 10);
      if (isNaN(offset) || offset < 0) offset = (page - 1) * limit;
    } else {
      offset = (page - 1) * limit;
    }

    return { type: 'pagination', limit, offset };
  }
}

module.exports = { getPagination };
