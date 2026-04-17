import { Router } from "express";
import { getProvider } from "../providers";
import { handleInbound } from "../services/inbound.service";
import { logger } from "../lib/logger";

const router = Router();

/**
 * POST /webhooks/:provider  — receive inbound messages from Uazapi or Official.
 * GET  /webhooks/official   — webhook verification (Meta challenge).
 */

// Meta webhook challenge
router.get("/official", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === process.env.WHATSAPP_OFFICIAL_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.status(403).json({ error: "forbidden" });
});

router.post("/:providerName", async (req, res, next) => {
  try {
    const providerName = req.params.providerName.toLowerCase();
    const provider = getProvider(providerName);
    const msg = provider.parseInboundWebhook(req.body);

    if (!msg) {
      // Could be a delivery receipt or unsupported event — ACK and move on
      return res.status(200).json({ ok: true, ignored: true });
    }

    await handleInbound(msg);
    logger.info({ providerName, from: msg.from }, "webhook processed");
    res.status(200).json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
