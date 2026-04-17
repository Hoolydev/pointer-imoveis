import { Pool, neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";

if (typeof WebSocket === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  neonConfig.webSocketConstructor = require("ws");
}

declare global {
  // eslint-disable-next-line no-var
  var __pv_prisma: PrismaClient | undefined;
}

function build(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({ connectionString });
  const adapter = new PrismaNeon(pool) as any;
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

// Lazy singleton — does NOT throw at import time if DATABASE_URL is missing.
// Throws only when a query is actually executed.
let _instance: PrismaClient | undefined;

function getInstance(): PrismaClient {
  if (_instance) return _instance;
  _instance = global.__pv_prisma ?? build();
  if (process.env.NODE_ENV !== "production") global.__pv_prisma = _instance;
  return _instance;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    return (getInstance() as any)[prop];
  },
});

export * from "@prisma/client";
