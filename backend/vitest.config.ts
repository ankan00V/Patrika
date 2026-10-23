import { defineConfig } from 'vitest/config';

/**
 * Integration tests run against real Postgres and Redis (docker compose up -d postgres redis).
 * They use a separate database and Redis db so they never touch dev data.
 */
export const testEnv = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://patrika:patrika@localhost:5432/patrika_test',
  REDIS_URL: process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/15',
  ELASTICSEARCH_URL: '',
  EMAIL_QUEUE_NAME: 'patrika-test-emails',
  JWT_SECRET: 'test-secret-0123456789abcdef',
  MIN_DELAY_BETWEEN_SENDS_MS: '0',
  MAX_EMAILS_PER_HOUR_PER_SENDER: '200',
  SEND_ATTEMPTS: '2',
};

export default defineConfig({
  test: {
    env: testEnv,
    globalSetup: ['./test/globalSetup.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
