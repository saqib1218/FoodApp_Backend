# Professional Node.js Express Backend

A professional, production-ready Node.js Express backend with PostgreSQL database integration, featuring authentication, authorization, and comprehensive error handling.

## 🚀 Features

- **Express.js** - Fast, unopinionated web framework
- **PostgreSQL** - Robust, open-source database
- **JWT Authentication** - Secure token-based authentication
- **Password Hashing** - bcryptjs for secure password storage
- **Input Validation** - express-validator for request validation
- **Error Handling** - Comprehensive error handling middleware
- **Security** - Helmet, CORS, rate limiting
- **Logging** - Morgan HTTP request logger
- **Compression** - Response compression for better performance
- **Environment Configuration** - dotenv for environment variables

## 📁 Project Structure

```
backend/
├── src/
│   ├── config/
│   │   └── database.js          # Database configuration
│   ├── middleware/
│   │   ├── auth.js              # Authentication middleware
│   │   ├── errorHandler.js      # Error handling middleware
│   │   └── notFound.js          # 404 handler
│   ├── routes/
│   │   ├── auth.js              # Authentication routes
│   │   └── users.js             # User management routes
│   ├── utils/
│   │   ├── jwt.js               # JWT utilities
│   │   └── validation.js        # Validation utilities
│   └── server.js                # Main server file
├── database/
│   └── schema.sql               # Database schema
├── package.json                 # Dependencies and scripts
├── env.example                  # Environment variables template
└── README.md                    # Project documentation
```

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp env.example .env
   ```
   
   Edit `.env` file with your configuration:
   ```env
   NODE_ENV=development
   PORT=3000
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=your_database_name
   DB_USER=your_username
   DB_PASSWORD=your_password
   JWT_SECRET=your_jwt_secret_key_here
   ```

4. **Set up PostgreSQL database**
   - Install PostgreSQL if not already installed
   - Create a new database
   - Run the schema file:
   ```bash
   psql -U your_username -d your_database_name -f database/schema.sql
   ```

5. **Start the server**
   ```bash
   # Development mode with auto-reload
   npm run dev
   
   # Production mode
   npm start
   ```

## 📚 API Documentation

### Authentication Endpoints

#### Register User
```http
POST /api/auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "SecurePass123"
}
```

#### Login User
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "SecurePass123"
}
```

#### Get Current User
```http
GET /api/auth/me
Authorization: Bearer <token>
```

#### Logout User
```http
POST /api/auth/logout
Authorization: Bearer <token>
```

### User Management Endpoints

#### Get All Users (Admin Only)
```http
GET /api/users
Authorization: Bearer <token>
```

#### Get User by ID
```http
GET /api/users/:id
Authorization: Bearer <token>
```

#### Update User
```http
PUT /api/users/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Updated Name",
  "email": "updated@example.com"
}
```

#### Change Password
```http
PUT /api/users/:id/password
Authorization: Bearer <token>
Content-Type: application/json

{
  "currentPassword": "OldPass123",
  "newPassword": "NewPass123"
}
```

#### Delete User (Admin Only)
```http
DELETE /api/users/:id
Authorization: Bearer <token>
```

### Health Check
```http
GET /health
```

## 🔐 Security Features

- **Password Hashing**: All passwords are hashed using bcryptjs
- **JWT Tokens**: Secure token-based authentication
- **Input Validation**: All inputs are validated and sanitized
- **Rate Limiting**: API rate limiting to prevent abuse
- **CORS**: Configurable Cross-Origin Resource Sharing
- **Helmet**: Security headers for Express
- **SQL Injection Protection**: Parameterized queries

## 🧪 Testing

```bash
# Run tests
npm test

# Run tests in watch mode
npm test -- --watch
```

## 📝 Scripts

- `npm start` - Start production server
- `npm run dev` - Start development server with nodemon
- `npm test` - Run tests
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint errors

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `development` |
| `PORT` | Server port | `3000` |
| `DB_HOST` | Database host | `localhost` |
| `DB_PORT` | Database port | `5432` |
| `DB_NAME` | Database name | - |
| `DB_USER` | Database username | - |
| `DB_PASSWORD` | Database password | - |
| `JWT_SECRET` | JWT secret key | - |
| `JWT_EXPIRES_IN` | JWT expiration time | `24h` |

## 🚀 Deployment

1. **Set environment variables** for production
2. **Build the application** (if using TypeScript)
3. **Start the server** with `npm start`
4. **Use a process manager** like PM2 for production
5. **Set up reverse proxy** with Nginx
6. **Configure SSL** certificates

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For support, please open an issue in the repository or contact the development team.

## 🔄 Default Admin Account

The database schema includes a default admin account:
- **Email**: admin@example.com
- **Password**: Admin123!

**⚠️ Important**: Change these credentials in production! 