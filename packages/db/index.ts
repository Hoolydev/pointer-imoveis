import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __pv_prisma: PrismaClient | undefined;
}

export const prisma =
  global.__pv_prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") global.__pv_prisma = prisma;

export * from "@prisma/client";
