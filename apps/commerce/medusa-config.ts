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
      REDIS_URL: "redis://127.0.0.1:6379/0",
      SAMMYS_REDIS_DB: "0",
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

const isolatedRedisUrl = (): string => {
  const redisUrl = requiredEnvironmentVariable("REDIS_URL");
  const redisDatabase = requiredEnvironmentVariable("SAMMYS_REDIS_DB");
  const parsedRedisUrl = new URL(redisUrl);
  const selectedDatabase = parsedRedisUrl.pathname.replace(/^\//u, "");

  if (selectedDatabase !== redisDatabase) {
    throw new Error(
      "REDIS_URL must select the logical database reserved by SAMMYS_REDIS_DB"
    );
  }

  return redisUrl;
};

// oxlint-disable-next-line unicorn/prefer-module -- Medusa loads this config through CommonJS.
module.exports = defineConfig({
  admin: {
    disable: true,
  },
  projectConfig: {
    databaseUrl: requiredEnvironmentVariable("DATABASE_URL"),
    http: {
      adminCors: requiredEnvironmentVariable("ADMIN_CORS"),
      authCors: requiredEnvironmentVariable("AUTH_CORS"),
      cookieSecret: requiredEnvironmentVariable("COOKIE_SECRET"),
      jwtSecret: requiredEnvironmentVariable("JWT_SECRET"),
      storeCors: requiredEnvironmentVariable("STORE_CORS"),
    },
    // A dedicated logical database isolates every Medusa Redis consumer,
    // including BullMQ keys whose names do not honor application prefixes.
    redisUrl: isolatedRedisUrl(),
  },
});
