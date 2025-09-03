// src/controllers/admin/kitchenController/index.js

// Kitchen CRUD / related controllers
const createKitchen = require('./createKitchen');
const addKitchenAddress = require('./addKitchenAddress');
const updateKitchenAvailability = require('./kitchenAvailability');
const processMedia = require('./processMedia');
const createChefInvitation = require('./chefInvite');

// Additional fetch controllers
const getKitchens = require('./getKitchens');
const getKitchenById = require('./getKitchenById');
const getKitchenAddressesById = require('./getKitchenAddressesById');
const getKitchenAvailabilityById = require('./getKitchenAvailabilityById');
const getKitchenPartners=require('./getKitchenPartners');

module.exports = {
  ...createKitchen,
  ...addKitchenAddress,
  ...updateKitchenAvailability,
  ...processMedia,
  ...createChefInvitation,
  ...getKitchens,
  ...getKitchenById,
  ...getKitchenAddressesById,
  ...getKitchenAvailabilityById,
  ...getKitchenPartners
};
