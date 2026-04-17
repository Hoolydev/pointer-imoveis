import IORedis, { Redis } from "ioredis";

declare global {
  // eslint-disable-next-line no-var
  var __pv_redis: Redis | undefined;
}

function build(): Redis {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.warn("[redis] REDIS_URL not set — queues disabled (campaigns will not send)");
    // Minimal no-op proxy so BullMQ Queue/Worker instantiation doesn't crash at import time
    return new Proxy({} as Redis, {
      get(_t, prop) {
        if (prop === "status") return "ready";
        if (prop === "options") return { enableReadyCheck: false, maxRetriesPerRequest: null };
        // BullMQ calls: xadd, xread, xlen, zadd, etc. — return a no-op async fn
        return (..._args: unknown[]) => Promise.resolve(null);
      },
    });
  }
  return new IORedis(url, {
    // BullMQ requirement
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}

export const redis: Redis = global.__pv_redis ?? build();
if (process.env.NODE_ENV !== "production") global.__pv_redis = redis;
