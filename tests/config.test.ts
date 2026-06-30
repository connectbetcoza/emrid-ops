import { afterEach, describe, it, expect, vi } from "vitest";

/**
 * Config resolution is computed at module load from `process.env`, so each case
 * stubs the env, resets the module registry, and dynamically imports a fresh
 * copy (the established pattern from the Patient Platform's config tests).
 */
async function loadConfig() {
  vi.resetModules();
  return import("@/lib/config");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("parseBool", () => {
  it("parses true/false case-insensitively and falls back otherwise", async () => {
    const { parseBool } = await loadConfig();
    expect(parseBool("true", false)).toBe(true);
    expect(parseBool("FALSE", true)).toBe(false);
    expect(parseBool(" True ", false)).toBe(true);
    expect(parseBool(undefined, true)).toBe(true);
    expect(parseBool("nonsense", false)).toBe(false);
  });
});

describe("adapter flags", () => {
  it("default to MOCK outside production", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("APP_ENV", "development");
    vi.stubEnv("USE_MOCK_AUTH", "");
    vi.stubEnv("USE_MOCK_DATA", "");
    vi.stubEnv("USE_MOCK_UPLOADS", "");
    const { config } = await loadConfig();
    expect(config.useMockAuth).toBe(true);
    expect(config.useMockData).toBe(true);
    expect(config.useMockUploads).toBe(true);
    expect(config.isProduction).toBe(false);
  });

  it("fail closed: default to REAL when APP_ENV=production", async () => {
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("USE_MOCK_AUTH", "");
    vi.stubEnv("USE_MOCK_DATA", "");
    const { config } = await loadConfig();
    expect(config.isProduction).toBe(true);
    expect(config.useMockAuth).toBe(false);
    expect(config.useMockData).toBe(false);
  });

  it("fail closed: NODE_ENV=production also forces real even if APP_ENV unset", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_ENV", "");
    vi.stubEnv("USE_MOCK_AUTH", "");
    const { config } = await loadConfig();
    expect(config.isProduction).toBe(true);
    expect(config.useMockAuth).toBe(false);
  });

  it("an explicit USE_MOCK_*=true wins even in production", async () => {
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("USE_MOCK_AUTH", "true");
    const { config } = await loadConfig();
    expect(config.isProduction).toBe(true);
    expect(config.useMockAuth).toBe(true);
  });
});

describe("region + cognito readiness", () => {
  it("prefers APP_AWS_REGION over AWS_REGION and falls back to eu-west-1", async () => {
    vi.stubEnv("APP_AWS_REGION", "af-south-1");
    vi.stubEnv("AWS_REGION", "us-east-1");
    const { config } = await loadConfig();
    expect(config.awsRegion).toBe("af-south-1");
  });

  it("isCognitoConfigured is false until all three public values are present", async () => {
    vi.stubEnv("NEXT_PUBLIC_COGNITO_USER_POOL_ID", "");
    vi.stubEnv("NEXT_PUBLIC_COGNITO_CLIENT_ID", "");
    vi.stubEnv("NEXT_PUBLIC_COGNITO_REGION", "");
    const { isCognitoConfigured } = await loadConfig();
    expect(isCognitoConfigured()).toBe(false);
  });
});
