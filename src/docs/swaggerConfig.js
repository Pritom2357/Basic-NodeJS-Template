const path = require('path');

const swaggerJsdocOptions = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Auth Template API',
      version: '1.0.0',
      description: 'Reusable Node.js authentication & user management template.'
    },
    servers: [
      { url: 'http://localhost:3000', description: 'Local Dev' }
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Add access token: Bearer <token>'
        }
      },
      schemas: {
        User: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              username: { type: 'string' },
              email: { type: 'string', format: 'email' },
              email_verified: { type: 'boolean' },
              subscription_type: { type: 'string', enum: ['free','plus','premium'] },
              avatar_url: { type: 'string' },
              created_at: { type: 'string', format: 'date-time' }
            }
        },
        AuthLoginRequest: {
          type: 'object',
          required: ['username','password'],
          properties: {
            username: { type: 'string' },
            password: { type: 'string', format: 'password' }
          }
        },
        AuthLoginResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            accessToken: { type: 'string' },
            refreshToken: { type: 'string' },
            user: { $ref: '#/components/schemas/User' }
          }
        },
        RegisterRequest: {
          type: 'object',
          required: ['username','email','password'],
          properties: {
            username: { type: 'string' },
            email: { type: 'string', format: 'email' },
            password: { type: 'string', format: 'password' }
          }
        },
        BasicSuccess: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string' }
          }
        }
      }
    },
    security: [
      { BearerAuth: [] }
    ],
    tags: [
      { name: 'Auth', description: 'Authentication & tokens' },
      { name: 'User', description: 'User profile & settings' }
    ]
  },
  apis: [
    path.join(__dirname, '..', 'routes', '*.js'),
    path.join(__dirname, '..', 'controllers', '*.js')
  ]
};

module.exports = {
  swaggerJsdocOptions
};