import type { Request, Response } from "express";

// Capture any startup error so we can surface it via HTTP instead of
// a generic FUNCTION_INVOCATION_FAILED with no detail.
let app: ((req: Request, res: Response) => void) | null = null;
let initError: Error | null = null;

try {
  const { buildApp } = require("../src/app");
  app = buildApp();
} catch (err: any) {
  initError = err;
  console.error("[startup] failed to build app:", err?.message, err?.stack);
}

export default function handler(req: Request, res: Response) {
  if (initError || !app) {
    return res.status(500).json({
      error: "App initialization failed",
      detail: initError?.message ?? "unknown",
      stack: initError?.stack?.split("\n").slice(0, 8),
    });
  }
  return app(req, res);
}
