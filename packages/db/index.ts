import { Pool, neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";

// Use WebSocket only in non-edge runtimes (Node.js serverless)
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

export const prisma: PrismaClient =
  global.__pv_prisma ?? build();

if (process.env.NODE_ENV !== "production") global.__pv_prisma = prisma;

export * from "@prisma/client";
