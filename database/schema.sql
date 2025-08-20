-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create users table
CREATE TABLE IF NOT EXISTS kitchen_users (
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

-- Add refresh_token column if it doesn't exist (for migration)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='refresh_token') THEN
        ALTER TABLE users ADD COLUMN refresh_token VARCHAR(100);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='mobileNumber') THEN
        ALTER TABLE users ADD COLUMN mobileNumber VARCHAR(20) UNIQUE;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='phone') THEN
        ALTER TABLE users RENAME COLUMN phone TO mobileNumber;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='password') THEN
        ALTER TABLE users RENAME COLUMN password TO pin;
    END IF;
END$$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_mobileNumber ON users(mobileNumber);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Drop and recreate the trigger
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Insert default admin user (password: Admin123!)
-- You should change this password in production
INSERT INTO users (name, email, pin, role) 
VALUES (
    'Admin User', 
    'admin@example.com', 
    '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4tbQJ8Kj1G', 
    'admin'
) ON CONFLICT (email) DO NOTHING;

-- Create a function to get user statistics
CREATE OR REPLACE FUNCTION get_user_stats()
RETURNS TABLE(
    total_users BIGINT,
    admin_count BIGINT,
    user_count BIGINT,
    latest_user_created TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) as total_users,
        COUNT(*) FILTER (WHERE role = 'admin') as admin_count,
        COUNT(*) FILTER (WHERE role = 'user') as user_count,
        MAX(created_at) as latest_user_created
    FROM users;
END;
$$ LANGUAGE plpgsql;

-- Create user_devices table
CREATE TABLE IF NOT EXISTS user_devices (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    device_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);