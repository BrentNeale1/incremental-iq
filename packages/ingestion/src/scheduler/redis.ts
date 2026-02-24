/**
 * Shared Redis connection configuration for BullMQ.
 *
 * Extracted to a separate module to avoid circular imports between
 * scheduler/queues.ts and scoring/dispatch.ts (both need redisConnection
 * but are imported by each other for different functions).
 *
 * Required env vars:
 *   REDIS_HOST     — Redis server hostname (default: localhost)
 *   REDIS_PORT     — Redis server port (default: 6379)
 *   REDIS_PASSWORD — Redis AUTH password (optional)
 */
export const redisConnection = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  password: process.env.REDIS_PASSWORD ?? undefined,
};
