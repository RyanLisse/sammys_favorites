import { defineConfig, loadEnv } from "@medusajs/framework/utils";

loadEnv(process.env.NODE_ENV ?? "development", process.cwd());

const requiredEnvironmentVariable = (name: string): string => {
  const value = process.env[name];

  if (!value && process.env.MEDUSA_BUILD === "true") {
    const buildDefaults: Record<string, string> = {
      ADMIN_CORS: "http://127.0.0.1:9000",
      AUTH_CORS: "http://127.0.0.1:8000,http://127.0.0.1:9000",
      COOKIE_SECRET: "build-only-cookie-secret-not-for-runtime",
      DATABASE_URL: "postgresql://build:build@127.0.0.1:5432/build",
      JWT_SECRET: "build-only-jwt-secret-not-for-runtime",
      REDIS_URL: "redis://127.0.0.1:6379",
      STORE_CORS: "http://127.0.0.1:8000",
    };
    const buildValue = buildDefaults[name];
    if (buildValue) {
      return buildValue;
    }
  }

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

module.exports = defineConfig({
  admin: {
    disable: true,
  },
  projectConfig: {
    databaseUrl: requiredEnvironmentVariable("DATABASE_URL"),
    redisUrl: requiredEnvironmentVariable("REDIS_URL"),
    http: {
      storeCors: requiredEnvironmentVariable("STORE_CORS"),
      adminCors: requiredEnvironmentVariable("ADMIN_CORS"),
      authCors: requiredEnvironmentVariable("AUTH_CORS"),
      jwtSecret: requiredEnvironmentVariable("JWT_SECRET"),
      cookieSecret: requiredEnvironmentVariable("COOKIE_SECRET"),
    },
  },
});
