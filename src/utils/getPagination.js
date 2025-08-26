// utils/pagination.js
/**
 * Utility to handle pagination or lazy loading
 * @param {object} params - { page, limit, lastId, defaultLimit }
 * @returns {object} - { type, limit, offset?, lastId? }
 */
function getPagination(params) {
  const limit = params.limit ? parseInt(params.limit, 10) : params.defaultLimit || 20;

  if (params.lastId) {
    // Lazy loading
    return { type: 'lazy', limit, lastId: params.lastId };
  } else {
    // Classic pagination
    const page = params.page ? parseInt(params.page, 10) : 1;
    const offset = (page - 1) * limit;
    return { type: 'pagination', limit, offset };
  }
}

module.exports = { getPagination };
