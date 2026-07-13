import { GoogleGenAI } from '@google/genai';
import { GoogleAuth } from 'google-auth-library';
import { z } from 'zod';

import { env } from './env';

/**
 * The client initializes lazily so credentials and project resolve via ADC
 * at the first request: the metadata server on Cloud Run, `gcloud auth
 * application-default login` locally. API keys never enter the picture.
 */
let client: Promise<GoogleGenAI> | undefined;

/** How long one Gemini round trip may take before the request fails fast. */
export const GEMINI_TIMEOUT_MS = 45_000;

const withTimeout = <T>(work: Promise<T>, ms: number, what: string): Promise<T> =>
  Promise.race([
    work,
    new Promise<never>((_, reject) => {
      const timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms}ms`)), ms);
      // Don't keep the process alive just for the watchdog.
      timer.unref?.();
    }),
  ]);

export const getGenAi = (): Promise<GoogleGenAI> => {
  client ??= (async () => {
    // The ADC probe can stall (no metadata server, broken network); bound it
    // so a request fails fast instead of hanging the caller forever.
    const project =
      env.project ?? (await withTimeout(new GoogleAuth().getProjectId(), 10_000, 'ADC project lookup'));
    return new GoogleGenAI({ vertexai: true, project, location: env.location });
  })();
  // A failed init must not wedge every later request behind the same
  // rejected (or stalled) promise; retry from scratch next time.
  client.catch(() => (client = undefined));
  return client;
};

/**
 * Gemini accepts standard JSON Schema, so the Zod contracts double as
 * structured-output schemas. The helper strips `$schema` since Gemini
 * rejects it.
 */
export const toResponseJsonSchema = (schema: z.ZodType): Record<string, unknown> => {
  const json: Record<string, unknown> = z.toJSONSchema(schema);
  delete json['$schema'];
  return json;
};
