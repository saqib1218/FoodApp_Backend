// routes/admin/user/index.js
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../../middleware/auth');

const kitchenController=require ('../../controllers/admin/kitchens')
router.post('/create',authenticateToken,kitchenController.createKitchen);
router.post('/:kitchenId/address',authenticateToken,kitchenController.addKitchenAddress);
router.put('/:kitchenId/availability',authenticateToken,kitchenController.updateKitchenAvailability);
router.get('/',authenticateToken,kitchenController.getKitchens);
router.get('/:kitchenId',authenticateToken,kitchenController.getKitchenById);
router.get('/:kitchenId/address',authenticateToken,kitchenController.getKitchenAddressesById);
router.get('/:kitchenId/availability',authenticateToken,kitchenController.getKitchenAvailabilityById);
router.get('/:kitchenId/partners',authenticateToken,kitchenController.getKitchenPartners);
router.patch('/:kitchenId',authenticateToken,kitchenController.editKitchen);
router.patch('/:kitchenId/address/:addressId',authenticateToken,kitchenController.editKitchenAddress);
router.get('/:kitchenId/requests',authenticateToken,kitchenController.getKitchenChangeRequests);
router.patch('/:kitchenId/submit',authenticateToken,kitchenController.submitKitchenForApproval);
router.post('/:kitchenId/media',authenticateToken,kitchenController.processMedia);
router.get('/:kitchenId/media',authenticateToken,kitchenController.getKitchenMediaByKitchenId);
router.delete('/:kitchenId/media/:mediaId/delete',authenticateToken,kitchenController.deleteKitchenMedia);



module.exports = router;