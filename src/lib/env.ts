export function getEnv() {
  return {
    redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
    port: parseInt(process.env.PORT ?? "3000", 10),
    dataDir: process.env.DATA_DIR ?? ".data",
  };
}
