const fetchRequestLogDetail=require('./fetchRequestLogDetail');
const getRequestLogs=require('./getRequestLogs');
const approveRequest=require('./approveRequest');
module.exports={
    ...fetchRequestLogDetail,
    ...getRequestLogs,
    ...approveRequest
    
}