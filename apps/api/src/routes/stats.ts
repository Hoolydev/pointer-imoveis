import { Router } from "express";
import { getDashboardStats } from "../services/inbound.service";

const router = Router();

router.get("/", async (_req, res, next) => {
  try {
    const stats = await getDashboardStats();
    res.json(stats);
  } catch (err) { next(err); }
});

export default router;
