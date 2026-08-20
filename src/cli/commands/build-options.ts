import * as v from 'valibot';

/** Default output directory (PRD §12 option-surface default). */
export const DEFAULT_OUT_DIR = 'dist';

/** Default config file, discovered in the execution directory (PRD §9). */
export const DEFAULT_CONFIG_FILE = 'fea-docs.config.js';

const nonEmptyString = v.pipe(v.string(), v.minLength(1));

/**
 * Schema for the `build` command option surface. Every field declares a
 * default, so a partial input still produces a complete option set, and the
 * strict object rejects unknown keys. This schema is the system boundary:
 * anything entering the build pipeline with these names is verified here.
 */
export const buildOptionsSchema = v.strictObject({
  outDir: v.exactOptional(nonEmptyString, DEFAULT_OUT_DIR),
  config: v.exactOptional(nonEmptyString, DEFAULT_CONFIG_FILE),
  strict: v.exactOptional(v.boolean(), false),
});

/** Verified, complete `build` options as they cross the system boundary. */
export type BuildCliOptions = v.InferOutput<typeof buildOptionsSchema>;

/**
 * Parse raw input against the build option schema. Throws a descriptive
 * error on anything incorrect or incomplete; returns fully defaulted options
 * on success.
 */
export function parseBuildOptions(raw: unknown): BuildCliOptions {
  const result = v.safeParse(buildOptionsSchema, raw);
  if (result.success) {
    return result.output;
  }

  const details = result.issues.map((issue) => {
    const location =
      issue.path && issue.path.length > 0
        ? issue.path.map((item) => String(item.key)).join('.')
        : 'options';
    return `${location}: ${issue.message}`;
  });
  throw new Error(`invalid build options: ${details.join('; ')}`);
}