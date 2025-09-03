// routes/admin/user/index.js
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../../middleware/auth');

const kitchenController=require ('../../controllers/admin/kitchens')
router.post('/create',authenticateToken,kitchenController.createKitchen);
router.post('/:id/address',authenticateToken,kitchenController.addKitchenAddress);
router.put('/:id/availability',authenticateToken,kitchenController.updateKitchenAvailability);
router.get('/',authenticateToken,kitchenController.getKitchens);
router.get('/:id',authenticateToken,kitchenController.getKitchenById);
router.get('/:id/address',authenticateToken,kitchenController.getKitchenAddressesById);
router.get('/:id/availability',authenticateToken,kitchenController.getKitchenAvailabilityById);
router.get('/:id/partners',authenticateToken,kitchenController.getKitchenPartners);

module.exports = router;