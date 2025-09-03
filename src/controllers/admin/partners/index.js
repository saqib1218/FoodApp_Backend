const getPartner=require ('./getPartners');
const getPartnerById=require('./getPartnerById');
module.exports={
    ...getPartner,
    ...getPartnerById

}