// routes/admin/user/index.js
const express = require('express');
<<<<<<< HEAD
=======

>>>>>>> af38919e5707fc22a8345a8d9dd175b5d77e1846
const router = express.Router();
const { authenticateToken } = require('../../middleware/auth');

const kitchenController=require ('../../controllers/admin/kitchens')
router.post('/create',authenticateToken,kitchenController.createKitchen);
<<<<<<< HEAD
router.post('/:id/address',authenticateToken,kitchenController.addKitchenAddress);
router.put('/:id/availability',authenticateToken,kitchenController.updateKitchenAvailability);
router.get('/',authenticateToken,kitchenController.getKitchens);
router.get('/:id',authenticateToken,kitchenController.getKitchenById);
router.get('/:id/address',authenticateToken,kitchenController.getKitchenAddressesById);
router.get('/:id/availability',authenticateToken,kitchenController.getKitchenAvailabilityById);
router.get('/:id/partners',authenticateToken,kitchenController.getKitchenPartners);
router.patch('/:id',authenticateToken,kitchenController.editKitchen);
router.patch('/:id/address/:id',authenticateToken,kitchenController.editKitchenAddress);
=======
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


>>>>>>> af38919e5707fc22a8345a8d9dd175b5d77e1846

module.exports = router;