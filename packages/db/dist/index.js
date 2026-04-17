"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const serverless_1 = require("@neondatabase/serverless");
const adapter_neon_1 = require("@prisma/adapter-neon");
const client_1 = require("@prisma/client");
// Use WebSocket only in non-edge runtimes (Node.js serverless)
if (typeof WebSocket === "undefined") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    serverless_1.neonConfig.webSocketConstructor = require("ws");
}
function build() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString)
        throw new Error("DATABASE_URL is not set");
    const pool = new serverless_1.Pool({ connectionString });
    const adapter = new adapter_neon_1.PrismaNeon(pool);
    return new client_1.PrismaClient({
        adapter,
        log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    });
}
exports.prisma = global.__pv_prisma ?? build();
if (process.env.NODE_ENV !== "production")
    global.__pv_prisma = exports.prisma;
__exportStar(require("@prisma/client"), exports);
