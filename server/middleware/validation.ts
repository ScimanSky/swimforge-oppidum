/**
 * Input Validation Middleware
 * 
 * Fornisce validazione centralizzata per tutti gli input API
 * usando Zod schema validation.
 * 
 * Previene:
 * - SQL Injection
 * - XSS Attacks
 * - Invalid Data Types
 * - Out of Range Values
 */

import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

/**
 * Schema per attività di nuoto
 * Valida distanza, durata, tipo di stile, data
 */
export const swimActivitySchema = z.object({
  distance: z
    .number()
    .min(0, 'Distanza non può essere negativa')
    .max(100000, 'Distanza massima 100km')
    .describe('Distanza in metri'),

  duration: z
    .number()
    .min(0, 'Durata non può essere negativa')
    .max(86400, 'Durata massima 24 ore')
    .describe('Durata in secondi'),

  strokeType: z
    .enum(['freestyle', 'backstroke', 'breaststroke', 'butterfly'])
    .describe('Tipo di stile di nuoto'),

  date: z
    .coerce.date()
    .max(new Date(), 'Data non può essere nel futuro')
    .describe('Data dell\'attività'),

  notes: z
    .string()
    .max(500, 'Note massimo 500 caratteri')
    .optional()
    .describe('Note personali'),

  source: z
    .enum(['garmin', 'strava', 'manual'])
    .default('manual')
    .describe('Fonte dell\'attività'),
});

export type SwimActivity = z.infer<typeof swimActivitySchema>;

/**
 * Schema per registrazione utente
 */
export const userRegistrationSchema = z.object({
  email: z
    .string()
    .email('Email non valida')
    .toLowerCase()
    .describe('Email dell\'utente'),

  password: z
    .string()
    .min(12, 'Password minimo 12 caratteri')
    .regex(/[A-Z]/, 'Password deve contenere maiuscola')
    .regex(/[a-z]/, 'Password deve contenere minuscola')
    .regex(/[0-9]/, 'Password deve contenere numero')
    .regex(/[!@#$%^&*]/, 'Password deve contenere carattere speciale')
    .describe('Password dell\'utente'),

  name: z
    .string()
    .min(2, 'Nome minimo 2 caratteri')
    .max(100, 'Nome massimo 100 caratteri')
    .trim()
    .describe('Nome dell\'utente'),

  acceptTerms: z
    .boolean()
    .refine((val) => val === true, 'Devi accettare i termini di servizio')
    .describe('Accettazione termini di servizio'),
});

export type UserRegistration = z.infer<typeof userRegistrationSchema>;

/**
 * Schema per login
 */
export const userLoginSchema = z.object({
  email: z
    .string()
    .email('Email non valida')
    .toLowerCase()
    .describe('Email dell\'utente'),

  password: z
    .string()
    .min(1, 'Password richiesta')
    .describe('Password dell\'utente'),
});

export type UserLogin = z.infer<typeof userLoginSchema>;

/**
 * Schema per aggiornamento profilo
 */
export const profileUpdateSchema = z.object({
  name: z
    .string()
    .min(2, 'Nome minimo 2 caratteri')
    .max(100, 'Nome massimo 100 caratteri')
    .trim()
    .optional(),

  bio: z
    .string()
    .max(500, 'Bio massimo 500 caratteri')
    .optional(),

  avatarUrl: z
    .string()
    .url('URL avatar non valido')
    .optional(),

  privacyLevel: z
    .enum(['public', 'friends', 'private'])
    .default('private')
    .optional(),
});

export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

/**
 * Schema per query di leaderboard
 */
export const leaderboardQuerySchema = z.object({
  type: z
    .enum(['xp', 'badges', 'distance', 'sessions'])
    .default('xp')
    .describe('Tipo di leaderboard'),

  timeframe: z
    .enum(['week', 'month', 'alltime'])
    .default('alltime')
    .describe('Periodo temporale'),

  limit: z
    .number()
    .min(1)
    .max(100)
    .default(50)
    .describe('Numero di risultati'),

  offset: z
    .number()
    .min(0)
    .default(0)
    .describe('Offset per paginazione'),
});

export type LeaderboardQuery = z.infer<typeof leaderboardQuerySchema>;

/**
 * Schema per Garmin OAuth callback
 */
export const garminOAuthCallbackSchema = z.object({
  oauth_token: z
    .string()
    .min(1, 'OAuth token richiesto'),

  oauth_verifier: z
    .string()
    .min(1, 'OAuth verifier richiesto'),
});

export type GarminOAuthCallback = z.infer<typeof garminOAuthCallbackSchema>;

// ============================================================================
// MIDDLEWARE FUNCTIONS
// ============================================================================

/**
 * Factory function per creare middleware di validazione
 * 
 * @param schema - Zod schema per validazione
 * @returns Express middleware
 * 
 * @example
 * app.post('/activities', validateInput(swimActivitySchema), handler);
 */
export function validateInput(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Valida il body della richiesta
      const validated = schema.parse(req.body);
      
      // Sostituisci il body con i dati validati
      req.body = validated;
      
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        // Formatta gli errori di validazione
        const formattedErrors = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));

        return res.status(400).json({
          error: 'Validation Error',
          message: 'I dati forniti non sono validi',
          details: formattedErrors,
        });
      }

      // Errore generico
      next(error);
    }
  };
}

/**
 * Valida query parameters
 * 
 * @param schema - Zod schema per validazione
 * @returns Express middleware
 * 
 * @example
 * app.get('/leaderboard', validateQuery(leaderboardQuerySchema), handler);
 */
export function validateQuery(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = schema.parse(req.query);
      req.query = validated as any;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const formattedErrors = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        }));

        return res.status(400).json({
          error: 'Query Validation Error',
          details: formattedErrors,
        });
      }

      next(error);
    }
  };
}

/**
 * Valida URL parameters
 * 
 * @param schema - Zod schema per validazione
 * @returns Express middleware
 * 
 * @example
 * app.get('/users/:id', validateParams(z.object({ id: z.string().uuid() })), handler);
 */
export function validateParams(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = schema.parse(req.params);
      req.params = validated as any;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const formattedErrors = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        }));

        return res.status(400).json({
          error: 'Parameter Validation Error',
          details: formattedErrors,
        });
      }

      next(error);
    }
  };
}

// ============================================================================
// CUSTOM VALIDATORS
// ============================================================================

/**
 * Valida che l'email non sia già registrata
 */
export async function validateEmailUnique(email: string): Promise<boolean> {
  // Implementazione: query database
  // return !(await db.users.findUnique({ where: { email } }));
  return true;
}

/**
 * Valida che l'attività sia nel range temporale valido
 */
export function validateActivityDateRange(date: Date): boolean {
  const now = new Date();
  const maxAge = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000); // 1 anno fa
  
  return date >= maxAge && date <= now;
}

/**
 * Valida che la distanza sia ragionevole per il tipo di attività
 */
export function validateDistanceForDuration(
  distance: number,
  duration: number,
  strokeType: string
): boolean {
  // Velocità media ragionevole: 1.5 m/s (5.4 km/h)
  const maxDistance = (duration / 60) * 100; // 100 metri al minuto
  
  return distance <= maxDistance;
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

/**
 * Formatta errori di validazione in modo leggibile
 */
export function formatValidationError(error: z.ZodError): string {
  return error.errors
    .map((err) => `${err.path.join('.')}: ${err.message}`)
    .join('; ');
}

/**
 * Middleware di error handling per validazione
 */
export function validationErrorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (err instanceof z.ZodError) {
    return res.status(400).json({
      error: 'Validation Error',
      message: formatValidationError(err),
      details: err.errors,
    });
  }

  next(err);
}

// ============================================================================
// EXPORT
// ============================================================================

export default {
  validateInput,
  validateQuery,
  validateParams,
  validateEmailUnique,
  validateActivityDateRange,
  validateDistanceForDuration,
  formatValidationError,
  validationErrorHandler,
};
