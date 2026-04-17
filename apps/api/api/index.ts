import type { Request, Response } from "express";
import { buildApp } from "../src/app";

const app = buildApp();

export default app;
