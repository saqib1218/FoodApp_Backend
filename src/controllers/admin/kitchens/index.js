// src/controllers/admin/kitchenController/index.js

// Kitchen CRUD / related controllers
const createKitchen = require('./createKitchen');
const addKitchenAddress = require('./addKitchenAddress');
const updateKitchenAvailability = require('./addiKtchenAvailability');
const processMedia = require('./addKitchenMedia');
const createChefInvitation = require('./chefInvite');
const getKitchenChangeRequests=require('./getKitchenRequestsById')
// Additional fetch controllers
const getKitchens = require('./getKitchens');
const getKitchenById = require('./getKitchenById');
const getKitchenAddressesById = require('./getKitchenAddressesById');
const getKitchenAvailabilityById = require('./getKitchenAvailabilityById');
const getKitchenPartners=require('./getKitchenPartners');
const editKitchen=require('./editKitchen');
const editKitchenAddress=require('./editKitchenAddress');
const submitKitchenForApproval=require('./submitKitchenForApproval');
const getKitchenMediaByKitchenId=require('./getKitchenMediaById');
const deleteKitchenMedia=require('./deleteKitchenMediaById');
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
  ...getKitchenPartners,
  ...editKitchen,
  ...editKitchenAddress,
  ...getKitchenChangeRequests,
  ...submitKitchenForApproval,
  ...getKitchenMediaByKitchenId,
  ...deleteKitchenMedia
};
