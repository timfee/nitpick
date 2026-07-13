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

export const getGenAi = (): Promise<GoogleGenAI> =>
  (client ??= (async () => {
    const project = env.project ?? (await new GoogleAuth().getProjectId());
    return new GoogleGenAI({ vertexai: true, project, location: env.location });
  })());

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
