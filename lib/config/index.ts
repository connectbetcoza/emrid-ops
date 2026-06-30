/**
 * Central configuration module for EMRID Operations.
 *
 * All environment access funnels through here so the rest of the app never
 * reads `process.env` directly. EMRID Operations reuses the *shared* platform
 * infrastructure (the same DynamoDB table, Cognito pool, S3 bucket, IAM
 * patterns) as the Patient Platform, so the same env-propagation rules apply.
 *
 * Adapter selection is split into THREE independent, server-side flags so each
 * subsystem can be migrated to AWS on its own:
 *   - USE_MOCK_AUTH    → mock Ops identity vs Cognito auth
 *   - USE_MOCK_DATA    → mock store vs DynamoDB repositories
 *   - USE_MOCK_UPLOADS → mock URLs vs S3 presigned uploads
 *
 * These are NOT `NEXT_PUBLIC_*` — they control server-only behaviour and must
 * not be exposed to the browser.
 *
 * Sprint 1 ships NO AWS wiring; this module exists so the configuration spine
 * is identical to the Patient Platform from day one and future sprints migrate
 * each subsystem without re-plumbing.
 */

/** Normalise an env value — treat empty string as "not set". */
function normalize(value: string | undefined): string | undefined {
  return value && value.length > 0 ? value : undefined;
}

/**
 * Read a SERVER-ONLY env var at runtime (computed access is fine — these are
 * resolved from the live process.env on the server).
 *
 * Do NOT use this for `NEXT_PUBLIC_*` vars: Next only inlines those at build
 * time when accessed as a STATIC member expression (`process.env.NEXT_PUBLIC_X`).
 * Computed access defeats the inlining, so on a host that doesn't forward
 * NEXT_PUBLIC_* to the SSR runtime (e.g. AWS Amplify) the value comes back
 * `undefined`. Public vars are read via static access in the `config` object.
 */
function env(key: string): string | undefined {
  return normalize(process.env[key]);
}

/** Parse a boolean env flag. Unknown/empty values fall back to `fallback`. */
export function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return fallback;
}

/**
 * App AWS region. Resolution order:
 *   1. APP_AWS_REGION — PRIMARY. Amplify Hosting rejects custom env vars with
 *      the reserved `AWS_` prefix, so `AWS_REGION` cannot be set there.
 *   2. AWS_REGION — local/runtime fallback (the Lambda runtime injects it).
 *   3. eu-west-1 — final default.
 */
const awsRegion = env("APP_AWS_REGION") ?? env("AWS_REGION") ?? "eu-west-1";

const appEnv = env("APP_ENV") ?? "development";

/**
 * Mock adapters default to ON for local dev but **fail closed in any deployed
 * environment** — the mocks must NEVER run in production, even if the
 * server-only flag env vars don't reach the runtime.
 *
 * Production is detected from `APP_ENV` **or** `NODE_ENV` — Next sets
 * `NODE_ENV=production` at runtime independently of console env propagation, so
 * an unset flag can never enable mocks in a deployed build. An explicit
 * `USE_MOCK_*=true|false` always wins.
 */
const isProduction =
  appEnv === "production" || process.env.NODE_ENV === "production";
const mockDefault = !isProduction;

export const config = {
  // NEXT_PUBLIC_* via STATIC access so Next inlines them at build (works on
  // Amplify even though it doesn't forward NEXT_PUBLIC_* to the SSR runtime).
  appUrl: normalize(process.env.NEXT_PUBLIC_APP_URL) ?? "http://localhost:3000",
  appEnv,
  isProduction,

  awsRegion,

  // Adapter flags — default to mock for local dev, fail closed in production.
  useMockAuth: parseBool(env("USE_MOCK_AUTH"), mockDefault),
  useMockData: parseBool(env("USE_MOCK_DATA"), mockDefault),
  useMockUploads: parseBool(env("USE_MOCK_UPLOADS"), mockDefault),

  // Auth (Cognito) — public app-client values, inlined at build (static access).
  cognito: {
    userPoolId: normalize(process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID),
    clientId: normalize(process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID),
    region: normalize(process.env.NEXT_PUBLIC_COGNITO_REGION),
  },

  // Data infra — server-side only (shared with the Patient Platform).
  aws: {
    region: awsRegion,
    dynamoTableName: env("DYNAMODB_TABLE_NAME"),
    s3DocumentBucket: env("S3_DOCUMENT_BUCKET"),
  },
} as const;

export type AppConfig = typeof config;

/** True once real Cognito values are present (used to detect AWS readiness). */
export function isCognitoConfigured(): boolean {
  return Boolean(
    config.cognito.userPoolId &&
      config.cognito.clientId &&
      config.cognito.region,
  );
}

let diagnosticsLogged = false;

/**
 * One-time, secret-free server diagnostic of how the runtime resolved its
 * adapter configuration. Logs ONLY booleans + the APP_ENV string — never
 * tokens, secrets, ids, table/bucket names, or raw env values.
 */
export function logResolvedConfig(): void {
  if (diagnosticsLogged) return;
  diagnosticsLogged = true;
  console.info("[emrid-ops] resolved config", {
    appEnv: config.appEnv,
    useMockAuth: config.useMockAuth,
    useMockData: config.useMockData,
    useMockUploads: config.useMockUploads,
    cognitoConfigured: isCognitoConfigured(),
    cognitoClientIdPresent: Boolean(config.cognito.clientId),
    cognitoUserPoolIdPresent: Boolean(config.cognito.userPoolId),
    cognitoRegionPresent: Boolean(config.cognito.region),
  });
}
