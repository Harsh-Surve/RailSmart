const express = require("express");
const AssistantEngine = require("../ai/AssistantEngine");

const router = express.Router();
const assistantEngine = new AssistantEngine();

router.post("/message", async (req, res) => {
  try {
    const requestContext = req.body?.context && typeof req.body.context === "object"
      ? req.body.context
      : {
          intent: req.body?.intent || null,
          source: req.body?.source || null,
          destination: req.body?.destination || null,
          travelClass: req.body?.travelClass || null,
          date: req.body?.date || null,
        };

    const result = await assistantEngine.process(req.body?.message, {
      ...requestContext,
      requestId: req.headers["x-request-id"] || null,
    });

    if (result?.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: "Assistant processing failed" });
  }
});

module.exports = router;
