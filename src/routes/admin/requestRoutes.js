// routes/admin/roleRoutes.js
const express = require('express');
const router = express.Router();

const requestController = require('../../controllers/requests'); 
const { authenticateToken } = require('../../middleware/auth');


router.get('/:requestId',authenticateToken,requestController.fetchRequestLogDetail);
router.get('/',authenticateToken,requestController.getRequestLogs)
router.patch('/:requestId/approve',authenticateToken,requestController.approveRequest)


module.exports = router;
