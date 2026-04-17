/**
 * Vercel serverless function entry point.
 * All routes are handled by the Express app.
 */
import { buildApp } from "../src/app";

export default buildApp();
