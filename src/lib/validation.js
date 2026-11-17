import { z } from 'zod';

/** Strips control characters and collapses whitespace in free text before it reaches the model. */
export const cleanText = (value) =>
  value
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const freeText = (max) => z.string().max(max).transform(cleanText);

export const COMMUTE_MODES = ['walk', 'cycle', 'public_transport', 'two_wheeler', 'car', 'work_from_home'];
export const COOKING_FUELS = ['lpg', 'png', 'electric', 'induction', 'biomass', 'kerosene'];
export const HEATING = ['none', 'electric_heater', 'blower', 'coal_or_wood', 'gas_heater'];
export const SENSITIVE_GROUPS = ['children', 'elderly', 'pregnant', 'asthma', 'heart_condition', 'outdoor_worker'];

export const locationSchema = z
  .object({
    city: freeText(80).pipe(z.string().min(2, 'Enter a city or locality (at least 2 characters).')).optional(),
    lat: z.coerce.number().min(-90).max(90).optional(),
    lon: z.coerce.number().min(-180).max(180).optional(),
  })
  .refine((v) => v.city || (typeof v.lat === 'number' && typeof v.lon === 'number'), {
    message: 'Provide a city name or both latitude and longitude.',
  });

export const profileSchema = z.object({
  householdSize: z.coerce.number().int().min(1).max(20).default(4),
  sensitiveGroups: z.array(z.enum(SENSITIVE_GROUPS)).max(SENSITIVE_GROUPS.length).default([]),
  commute: z.enum(COMMUTE_MODES).default('public_transport'),
  cookingFuel: z.enum(COOKING_FUELS).default('lpg'),
  heating: z.enum(HEATING).default('none'),
  hasAirPurifier: z.boolean().default(false),
  notes: freeText(300).optional().default(''),
});

export const adviceRequestSchema = z.object({
  location: locationSchema,
  profile: profileSchema.prefault({}),
  language: z.enum(['en', 'hi', 'mr']).default('en'),
});

export const chatRequestSchema = z.object({
  question: freeText(500).pipe(z.string().min(3, 'Ask a question of at least 3 characters.')),
  location: locationSchema,
  profile: profileSchema.prefault({}),
  language: z.enum(['en', 'hi', 'mr']).default('en'),
});

/** Formats a Zod error into a short, user-safe message. */
export function formatZodError(error) {
  const first = error.issues?.[0];
  if (!first) return 'Invalid request.';
  const path = first.path?.length ? `${first.path.join('.')}: ` : '';
  return `${path}${first.message}`;
}
