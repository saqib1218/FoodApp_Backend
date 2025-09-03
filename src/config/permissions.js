const PERMISSIONS = {
  ADMIN: {
    USER: {
      CREATE: "admin.user.create",
      LIST_VIEW: "admin.user.list.view",
      DELETE: "admin.user.delete",
      EDIT: "admin.user.edit",
      ACTIVATE: "admin.user.activate",      // ✅ permission to activate a user
      DEACTIVATE: "admin.user.deactivate",  // ✅ permission to deactivate a user
                  // ✅ permission to view user details
    },
ROLE: {
    CREATE: "admin.role.create",
    EDIT: "admin.role.edit",
    DELETE: "admin.role.delete",
    LIST_VIEW: "admin.role.list.view", // ✅ permission to view role details
  },
  PERMISSION: {
    CREATE: "admin.permission.create",
    EDIT: "admin.permission.edit",
    DELETE: "admin.permission.delete",
    LIST_VIEW: "admin.permission.list.view", // ✅ permission to view permission details
  },
KITCHEN: {
  CREATE: "admin.kitchen.create",
  EDIT: "admin.kitchen.edit",
  DELETE: "admin.kitchen.delete",
  LIST_VIEW: "admin.kitchen.list.view",
  DETAIL_VIEW:"admin.kitchen.detail.view",       // ✅ view list of kitchens
  ADD_ADDRESS: "admin.kitchen.address.add",
  ADDRESS_VIEW: "admin.kitchen.address.view",
  PARTNER_LIST:"admin.kitchen.partner.list.view",
   
  AVAILABILITY: "admin.kitchen.availability.add", 
    AVAILABILITY_VIEW: "admin.kitchen.availability.view", 
  INVITE_CHEF:"admin.kitchen.chef.invite" // ✅ manage kitchen availability
},PARTNER: {
  CREATE: "admin.partner.create",
  EDIT: "admin.partner.edit",
  DELETE: "admin.partner.delete",
  LIST_VIEW: "admin.partner.list.view",
  DETAIL_VIEW:"admin.partner.detail.view"        // ✅ view list of kitchens

}

  },
};

module.exports = PERMISSIONS;
