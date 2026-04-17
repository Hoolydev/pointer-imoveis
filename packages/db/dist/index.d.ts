import { PrismaClient } from "@prisma/client";
declare global {
    var __pv_prisma: PrismaClient | undefined;
}
export declare const prisma: PrismaClient;
export * from "@prisma/client";
