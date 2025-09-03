// ✅ Convert object keys from snake_case → camelCase (safe)
function toCamel(obj) {
  if (obj === null || obj === undefined) {
    return obj; // prevent crash
  }

  if (Array.isArray(obj)) {
    return obj.map(v => toCamel(v));
  }

  if (typeof obj === 'object' && obj.constructor === Object) {
    return Object.keys(obj).reduce((result, key) => {
      const camelKey = key.replace(/([-_][a-z])/gi, (group) =>
        group.toUpperCase().replace('_', '')
      );
      result[camelKey] = toCamel(obj[key]);
      return result;
    }, {});
  }

  return obj;
}

module.exports = { toCamel };
