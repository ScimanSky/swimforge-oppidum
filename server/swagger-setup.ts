/**
 * Swagger/OpenAPI Setup
 * 
 * Auto-generates API documentation from code
 * Accessible at: /api/docs
 */

import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'SwimForge API',
      version: '1.0.0',
      description: 'Complete API documentation for SwimForge swimming app',
      contact: {
        name: 'SwimForge Team',
        email: 'support@swimforge.com',
      },
    },
    servers: [
      {
        url: process.env.API_URL || 'http://localhost:3000',
        description: 'Development server',
      },
      {
        url: 'https://swimforge-api.onrender.com',
        description: 'Production server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        // User Profile
        UserProfile: {
          type: 'object',
          properties: {
            userId: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            email: { type: 'string', format: 'email' },
            profileImage: { type: 'string', format: 'uri' },
          },
          required: ['userId', 'name', 'email'],
        },

        // Leaderboard Entry
        LeaderboardEntry: {
          type: 'object',
          properties: {
            rank: { type: 'integer' },
            userId: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            totalXp: { type: 'integer' },
            level: { type: 'integer' },
            badgeCount: { type: 'integer' },
          },
          required: ['rank', 'userId', 'name', 'totalXp', 'level'],
        },

        // Swimming Activity
        SwimmingActivity: {
          type: 'object',
          properties: {
            activityId: { type: 'string', format: 'uuid' },
            userId: { type: 'string', format: 'uuid' },
            activityDate: { type: 'string', format: 'date-time' },
            strokeType: { type: 'string', enum: ['freestyle', 'backstroke', 'breaststroke', 'butterfly', 'mixed'] },
            distanceMeters: { type: 'integer' },
            durationSeconds: { type: 'integer' },
            avgPacePer100m: { type: 'number' },
            calories: { type: 'integer' },
          },
          required: ['activityId', 'userId', 'activityDate', 'strokeType', 'distanceMeters'],
        },

        // Badge
        Badge: {
          type: 'object',
          properties: {
            badgeId: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            description: { type: 'string' },
            badgeImageUrl: { type: 'string', format: 'uri' },
            rarity: { type: 'string', enum: ['common', 'rare', 'epic', 'legendary'] },
          },
          required: ['badgeId', 'name', 'rarity'],
        },

        // User Statistics
        UserStatistics: {
          type: 'object',
          properties: {
            userId: { type: 'string', format: 'uuid' },
            totalActivities: { type: 'integer' },
            totalDistance: { type: 'integer' },
            totalTime: { type: 'integer' },
            avgPace: { type: 'number' },
            lastActivity: { type: 'string', format: 'date-time' },
            totalXp: { type: 'integer' },
            currentLevel: { type: 'integer' },
          },
          required: ['userId', 'totalActivities', 'totalDistance'],
        },

        // Error Response
        ErrorResponse: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
            statusCode: { type: 'integer' },
          },
          required: ['error', 'message', 'statusCode'],
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: [
    './server/routes/leaderboard.ts',
    './server/routes/activities.ts',
    './server/routes/badges.ts',
    './server/routes/stats.ts',
    './server/routes/users.ts',
  ],
};

const swaggerSpec = swaggerJsdoc(options);

export function setupSwagger(app: Express) {
  // Swagger UI
  app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      swaggerOptions: {
        persistAuthorization: true,
        displayOperationId: true,
        defaultModelsExpandDepth: 1,
        defaultModelExpandDepth: 1,
      },
      customCss: `
        .swagger-ui .topbar { display: none; }
        .swagger-ui .info .title { color: #1f2937; }
      `,
    })
  );

  // JSON spec
  app.get('/api/docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });

  console.log('[Swagger] Documentation available at /api/docs');
}

export default swaggerSpec;
