// routes/admin/user/index.js
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../../middleware/auth');

const partnerController=require ('../../controllers/admin/partners')

router.get('/',authenticateToken,partnerController.getPartners);
router.get('/:id',authenticateToken,partnerController.getPartnerById);

module.exports = router;