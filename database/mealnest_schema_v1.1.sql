
-- Enable UUID support
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Kitchen Management

CREATE TABLE kitchens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    tagline TEXT,
    bio TEXT,
    is_logo_available BOOLEAN DEFAULT FALSE,
    status TEXT DEFAULT 'pending',
    created_by UUID REFERENCES kitchen_users(id),
    updated_by UUID REFERENCES kitchen_users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Kitchen Permissions Table
CREATE TABLE kitchen_permissions (
    permission_id TEXT PRIMARY KEY,  -- e.g., 'chefInvite.create'
    permission_name TEXT NOT NULL    -- e.g., 'Invite'
);

-- Kitchen Permissions
INSERT INTO kitchen_permissions (permission_id, permission_name)
VALUES
('kitchen.create', 'Create Kitchen'),
('kitchen.update', 'Update Kitchen Details'),
('kitchen.availability.update', 'Update Kitchen Availability'),
('kitchen.address.create', 'Add Kitchen Address'),
('kitchen.address.update', 'Update Kitchen Address'),
('kitchen.media.create', 'Add Kitchen Media'),
('kitchen.roles.manage', 'Manage Kitchen Roles and Permissions'),

-- Chef Invitation Permissions
('kitchen.chefInvite.create', 'Invite Chef'),
('kitchen.chefInvite.approve', 'Approve Chef Invitation'),
('kitchen.chefInvite.reject', 'Reject Chef Invitation'),
('kitchen.chefInvite.cancel', 'Cancel Chef Invitation');


-- Kitchen Role Permissions Table
CREATE TABLE kitchen_role_permissions (
    role_name TEXT NOT NULL,  -- e.g., 'owner', 'chef'
    permission_id TEXT NOT NULL REFERENCES kitchen_permissions(permission_id),
    PRIMARY KEY (role_name, permission_id)
);

-- Example seeds for owner role
INSERT INTO kitchen_role_permissions (role_name, permission_id)
VALUES
('owner', 'kitchen.create'),
('owner', 'kitchen.update'),
('owner', 'kitchen.availability.update'),
('owner', 'kitchen.address.create'),
('owner', 'kitchen.address.update'),
('owner', 'kitchen.media.create'),
('owner', 'kitchen.roles.manage'),
('owner', 'kitchen.chefInvite.create'),
('owner', 'kitchen.chefInvite.approve'),
('owner', 'kitchen.chefInvite.reject'),
('owner', 'kitchen.chefInvite.cancel');
CREATE TABLE kitchen_media (
    id UUID PRIMARY KEY,
    kitchen_id UUID NOT NULL REFERENCES kitchens(id) ON DELETE CASCADE,
    media_type TEXT NOT NULL,         -- 'image', 'video', 'audio'
    category_type TEXT,               -- 'logo', 'banner', 'thumbnail' (optional)
    s3_key_original TEXT,             -- path to original file in S3/MinIO
    s3_key_thumbnail TEXT,            -- path to thumbnail version (optional)
    s3_key_banner TEXT,               -- path to banner version (optional)
    status TEXT NOT NULL DEFAULT 'under_processing',  -- 'under_processing', 'uploaded', 'failed'
    created_by UUID NOT NULL,
    updated_by UUID NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);



CREATE TABLE kitchen_images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kitchen_id UUID REFERENCES kitchens(id),
    position INT DEFAULT 0
	is_banner BOOLEAN DEFAULT FALSE,
	status TEXT DEFAULT 'pending',
	created_at TIMESTAMP DEFAULT NOW(),
	updated_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE days_of_week (
    id CHAR(3) PRIMARY KEY,     -- 'Mon', 'Tue', 'Wed', etc.
    name TEXT UNIQUE NOT NULL    -- Full name, e.g., 'Monday'
);
INSERT INTO days_of_week (id, name) VALUES
('Mon', 'Monday'),
('Tue', 'Tuesday'),
('Wed', 'Wednesday'),
('Thu', 'Thursday'),
('Fri', 'Friday'),
('Sat', 'Saturday'),
('Sun', 'Sunday');


--here we have to probably add a Slot for Full-Day so if any Kitchen is available full day all three slots - then this slot_id can be given it to that dish - to keep it simple
--Breakfast, Dinner, Lunch, Iftar and ..... meta data table
--Label_key is for translation
CREATE TABLE kitchen_availability_slots (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    label_key TEXT NOT NULL,
    default_start_time TIME,
    default_end_time TIME
);
INSERT INTO kitchen_availability_slots (name, label_key, default_start_time, default_end_time)
VALUES
('breakfast', 'slot.breakfast', '08:00:00', '10:30:00'),
('lunch', 'slot.lunch', '12:00:00', '15:00:00'),
('dinner', 'slot.dinner', '18:00:00', '21:00:00'),
('iftar', 'slot.iftar', '18:30:00', '20:00:00'),
('full_day', 'slot.full_day', '00:00:00', '23:59:59');


-- Kitchen availability table
CREATE TABLE kitchen_availability (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kitchen_id UUID REFERENCES kitchens(id),
    day_of_week_id CHAR(3) REFERENCES days_of_week(id),  -- 'Mon', 'Tue', etc.
    slot_id INT REFERENCES kitchen_availability_slots(id),
    is_available BOOLEAN DEFAULT FALSE,
    custom_start_time TIME,
    custom_end_time TIME,
    created_by UUID REFERENCES kitchen_users(id),
    updated_by UUID REFERENCES kitchen_users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Kitchen Users & Roles
-- +92 should be the format of the Mobile Number
-- PIN is hashed and salt
-- TOKEN is a unique token generated after device is secured also stored in Mobile secret storage to validate
CREATE TABLE kitchen_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kitchen_id UUID REFERENCES kitchens(id) NULL,
    name TEXT NOT NULL,
    phone TEXT UNIQUE NOT NULL,
    email TEXT,
    bio TEXT,
	pin TEXT NOT NULL,
	is_kyc_verified BOOLEAN DEFAULT FALSE,
    status TEXT DEFAULT 'pending',
    is_primary_owner BOOLEAN DEFAULT FALSE,
    date_of_birth DATE,
    gender TEXT,
    joined_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP
);

CREATE TABLE kitchen_user_auth (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kitchen_user_id UUID REFERENCES kitchen_users(id) NULL,
	retry_count INT DEFAULT 0,
	is_pin_blocked BOOLEAN DEFAULT FALSE,
	auth_token TEXT,
	auth_token_created_at TIMESTAMP DEFAULT NOW(),
	is_auth_token_expired BOOLEAN DEFAULT FALSE,
    last_accessed TIMESTAMP DEFAULT NOW(),
	created_at TIMESTAMP DEFAULT NOW(),
	updated_at TIMESTAMP DEFAULT NOW()
);


-- seeding kithecn roles - owner/chef
CREATE TABLE kitchen_roles (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    label_key TEXT NOT NULL,
	status TEXT DEFAULT 'active',
);

-- Seed kitchen_roles table
INSERT INTO kitchen_roles (name, label_key, status)
VALUES
('owner', 'Owner', 'active'),
('chef', 'Chef', 'active');

CREATE TABLE kitchen_user_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kitchen_user_id UUID REFERENCES kitchen_users(id),
    role_id INT REFERENCES kitchen_roles(id),
	status TEXT DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW(),
	updated_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE kitchen_addresses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kitchen_id UUID NOT NULL REFERENCES kitchens(id),
    address_name TEXT,
    address_line1 TEXT,
    address_line2 TEXT,
    city TEXT,
    state TEXT,
    zone TEXT,
    postal_code TEXT,
    country TEXT,
    nearest_location TEXT,
    delivery_instruction TEXT,
    status BOOLEAN DEFAULT TRUE, -- only one active at a time
    latitude DECIMAL(9,6),
    longitude DECIMAL(9,6),
    place_id TEXT,            -- optional, from Google Maps API
    formatted_address TEXT,   -- optional, from Google Maps API
    map_link TEXT,            -- optional, user-provided map link
    created_by UUID REFERENCES kitchen_users(id),
    updated_by UUID REFERENCES kitchen_users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

--Invite a Chef by Owner
CREATE TABLE kitchen_user_invitations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kitchen_id UUID REFERENCES kitchens(id),
    invited_by_id UUID REFERENCES kitchen_users(id),
    phone TEXT NOT NULL,
    role TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    invitation_code TEXT,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP
);

CREATE TABLE kitchen_invite_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invitation_id UUID REFERENCES kitchen_user_invitations(id),
    action TEXT NOT NULL,
    performed_by_id UUID REFERENCES kitchen_users(id),
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP
);

--will discuss this later as how do we store each step of Kitchen Onboarding steps
--as user will be providing kithchen details in pieces and stages and might continue onboarding multiple days

CREATE TABLE kitchen_onboarding_status (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kitchen_id UUID UNIQUE REFERENCES kitchens(id),
    step TEXT,
    is_complete BOOLEAN DEFAULT FALSE,
    last_updated TIMESTAMP DEFAULT NOW()
);

--Need to make sure if we keep verified_by here or in the activity table
CREATE TABLE kitchen_user_id_docs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kitchen_user_id UUID REFERENCES kitchen_users(id),
    id_type TEXT NOT NULL,
    id_number TEXT,
    document_url TEXT,
    status TEXT DEFAULT 'pending',
    verified_at TIMESTAMP,
    submitted_at TIMESTAMP DEFAULT NOW(),
	verified_by UUID,
);

-- Dish Management
-- This table is for different categories of Dishes (Catoring, readily available, made to order and event based)
-- this table will have some flag like which screen/steps/configuration are available for dishes under these dish-types or not
-- will keep on adding toggle flags in this table
CREATE TABLE dish_types (
    id SERIAL PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT UNIQUE NOT NULL,
    label_key TEXT NOT NULL,
    uses_slots BOOLEAN DEFAULT TRUE,
    requires_lead_time BOOLEAN DEFAULT FALSE,
    allows_custom_date_range BOOLEAN DEFAULT FALSE,
    is_side_on BOOLEAN DEFAULT FALSE
);

CREATE TABLE dishes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kitchen_id UUID REFERENCES kitchens(id),
    dish_type_id INT REFERENCES dish_types(id),
	title TEXT NOT NULL, 
    story TEXT,
    is_active BOOLEAN DEFAULT TRUE,
	is_customization_allowed BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP

);


CREATE TABLE dish_labels (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    label_key TEXT NOT NULL
	status TEXT DEFAULT 'pending'
);


CREATE TABLE dish_label_map (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dish_id UUID REFERENCES dishes(id),
    label_id UUID REFERENCES dish_labels(id),
	status TEXT DEFAULT 'pending',
	created_at TIMESTAMP DEFAULT NOW(),
	updated_at TIMESTAMP DEFAULT NOW(),
	UNIQUE(dish_id, label_id)
);

CREATE TABLE dish_images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dish_id UUID REFERENCES dishes(id),
    position INT DEFAULT 0,
	is_default BOOLEAN DEFAULT FALSE,
	status TEXT DEFAULT 'pending',
	created_at TIMESTAMP DEFAULT NOW(),
	updated_at TIMESTAMP DEFAULT NOW()
);

--there is no video URL - videoID will be there and will fetch from Video ID from s3
-- we need to see if we need to really keep videos seperatly or just keep it in dishes table
CREATE TABLE dish_videos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dish_id UUID REFERENCES dishes(id),
    position INT DEFAULT 0,
	is_default BOOLEAN DEFAULT FALSE,
	status TEXT DEFAULT 'pending',
	created_at TIMESTAMP DEFAULT NOW(),
	updated_at TIMESTAMP DEFAULT NOW()
);

--there is no Audio URL - audioID will be there and will fetch from Audio ID from s3
-- we need to see if we need to really keep Audios seperatly or just keep it in dishes table
CREATE TABLE dish_audios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dish_id UUID REFERENCES dishes(id),
    position INT DEFAULT 0,
	is_default BOOLEAN DEFAULT FALSE,
	status TEXT DEFAULT 'pending',
	created_at TIMESTAMP DEFAULT NOW(),
	updated_at TIMESTAMP DEFAULT NOW()
);


-- there is no dish VARIANt Concept now - but we will internally manage per variant so later it's easier to add multiple variants in a dish
-- DISH PRICING NEEDS TO BE CHECKED AND REFINED yet
CREATE TABLE dish_variants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dish_id UUID REFERENCES dishes(id),
    title TEXT NOT NULL, 
    price NUMERIC(10,2),
    serving TEXT,
    quantity_available INT,
    min_order_quantity INT DEFAULT 1,
	created_at TIMESTAMP DEFAULT NOW(),
	updated_at TIMESTAMP DEFAULT NOW()
   
);

CREATE TABLE dish_availability (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dish_id UUID REFERENCES dishes(id),
    day_of_week TEXT CHECK (day_of_week IN ('monday','tuesday','wednesday','thursday','friday','saturday','sunday')),
    slot_id INT REFERENCES kitchen_availability_slots(id),
    is_available BOOLEAN DEFAULT TRUE,
    custom_start_time TIME,
    custom_end_time TIME,
);


 -- e.g., "Bestseller", Top Rated
 -- Icon will be iconID loaded in the app images folder
 -- label_key, "badge.bestseller"
CREATE TABLE badges (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,   
	badge_type TEXT CHECK (applies_to IN ('dish', 'kitchen', 'both')) NOT NULL,	
    icon TEXT,                           
    label_key TEXT NOT NULL UNIQUE,
   
);

--asigned by will be in audit table
CREATE TABLE dish_badge_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dish_id UUID REFERENCES dishes(id) ON DELETE CASCADE,
    badge_id INT REFERENCES badges(id),
    status TEXT DEFAULT 'pending',
	created_at TIMESTAMP DEFAULT NOW(),
	updated_at TIMESTAMP DEFAULT NOW(),
	UNIQUE(dish_id, badge_id)
	
);

--asigned by will be in audit table

CREATE TABLE kitchen_badge_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kitchen_id UUID REFERENCES kitchens(id) ON DELETE CASCADE,
    badge_id INT REFERENCES badges(id),
	status TEXT DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW(),
	updated_at TIMESTAMP DEFAULT NOW(),
	UNIQUE(dish_id, badge_id)
);





-- Dish Type Specific

CREATE TABLE dish_catering (
    dish_id UUID PRIMARY KEY REFERENCES dishes(id),
    min_guest_count INT,
	max_guest_count INT,
	prep_time_hours INT NOT NULL,
    total_price NUMERIC(10,2),
	is_negotiable BOOLEAN DEFAULT TRUE, 
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE dish_catering_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dish_catering_id UUID REFERENCES dish_catering(dish_id)
    name TEXT NOT NULL,                           -- Free-text dish name
    description TEXT,                             -- Optional detail (if needed)
    is_optional BOOLEAN DEFAULT FALSE,            -- For marking extras
    position INT DEFAULT 0,                       -- For display order
	updated_at TIMESTAMP DEFAULT NOW()
  
);


CREATE TABLE dish_special_event (
    dish_id UUID PRIMARY KEY REFERENCES dishes(id),
    event_date DATE,
	event_from TIMESTAMP,
    event_to TIMESTAMP,
	preorder_start_date DATE,
	preorder_end_date DATE,
    preorder_end_time TIMESTAMP,
    updated_at TIMESTAMP DEFAULT NOW()
);



CREATE TABLE dish_readily (
    dish_id UUID PRIMARY KEY REFERENCES dishes(id),
    prep_time_minutes INT NOT NULL,
    available_from DATE,
    available_to DATE,
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE dish_made_to_order (
    dish_id UUID PRIMARY KEY REFERENCES dishes(id),
    prep_time_hours INT NOT NULL,
    available_from DATE,
    available_to DATE,
    updated_at TIMESTAMP DEFAULT NOW()
);


CREATE TABLE dish_side_on (
    dish_id UUID PRIMARY KEY REFERENCES dishes(id),
    main_dish_id UUID REFERENCES dishes(id),
    is_optional BOOLEAN DEFAULT TRUE,
	is_active BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMP DEFAULT NOW(),
	UNIQUE(dish_id, linked_to_dish_id)
);

CREATE TABLE dish_daily_limits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dish_id UUID REFERENCES dishes(id),
    limit_type TEXT CHECK (limit_type IN ('portion', 'order')) NOT NULL,
    daily_limit_value INT NOT NULL,
    auto_disable_when_full BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Audit Logs

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_name TEXT NOT NULL,
    record_id UUID NOT NULL,
    action TEXT CHECK (action IN ('insert', 'update', 'delete')) NOT NULL,
    changed_by TEXT,
    change_summary JSONB,
    changed_at TIMESTAMP DEFAULT NOW()
);



---------------------------- Admin Tables-------------
CREATE TABLE admin_roles (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,              
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    created_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
    updated_at TIMESTAMP,
    updated_by UUID REFERENCES admin_users(id) ON DELETE SET NULL
);

CREATE TABLE admin_roles (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,              
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    created_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
    updated_at TIMESTAMP,
    updated_by UUID REFERENCES admin_users(id) ON DELETE SET NULL
);

-- e.g. 'edit_dishes', 'view_orders'
CREATE TABLE admin_permissions (
    id SERIAL PRIMARY KEY,
    key TEXT UNIQUE NOT NULL,               
    description TEXT
);
CREATE TABLE admin_permissions (
    id SERIAL PRIMARY KEY,
    key TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
    updated_at TIMESTAMP,
    updated_by UUID REFERENCES admin_users(id) ON DELETE SET NULL
);


--which role will have which permission
CREATE TABLE admin_role_permissions (
    id SERIAL PRIMARY KEY,
    role_id INT REFERENCES admin_roles(id) 
    permission_id INT REFERENCES admin_permissions(id) 
    UNIQUE(role_id, permission_id)
);


CREATE TABLE admin_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP
);

CREATE TABLE admin_user_roles (
    id SERIAL PRIMARY KEY,
    admin_user_id UUID REFERENCES admin_users(id) 
    role_id INT REFERENCES admin_roles(id) 
    assigned_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(admin_user_id, role_id)
);


-- e.g. 'edited_dish', 'assigned_badge'
-- e.g. 'dish', 'kitchen', 'order'
-- e.g. { "field": "status", "old": "pending", "new": "approved" }

CREATE TABLE admin_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_user_id UUID REFERENCES admin_users(id),
    action TEXT NOT NULL,                       
    target_type TEXT,                           
    target_id UUID,
    metadata JSONB,                             
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE admin_user_auth (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_user_id UUID REFERENCES admin_users(id),
    refresh_token TEXT UNIQUE,
    refresh_token_created_at TIMESTAMP DEFAULT NOW(),
    is_refresh_token_expired BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
