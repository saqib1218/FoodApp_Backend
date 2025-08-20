const createKitchen=require ('./createKitchen');
const addKitchenAddress=require('./addKitchenAddress');

const updateKitchenAvailability=require('./kitchenAvailability');
const processMedia=require('./processMedia');
const createChefInvitation=require('./chefInviteController')

module.exports={
    ...addKitchenAddress,
    ...createKitchen,
    ...processMedia,
    ...updateKitchenAvailability,
    ...createChefInvitation
}
