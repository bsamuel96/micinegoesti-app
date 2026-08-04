import cors from "cors";
import express from "express";
import * as helmetModule from "helmet";
import morgan from "morgan";
import { config } from "./config.js";
import { attachUser } from "./middleware/auth.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { cartRouter } from "./modules/cart/cart.routes.js";
import { deliveryRouter } from "./modules/delivery/delivery.routes.js";
import { feedbackFlowRouter } from "./modules/feedback/feedback-flow.routes.js";
import { feedbackRouter } from "./modules/feedback/feedback.routes.js";
import { gameRouter } from "./modules/game/game.routes.js";
import { logsRouter } from "./modules/logs/logs.routes.js";
import { ordersRouter } from "./modules/orders/orders.routes.js";
import { productsRouter } from "./modules/products/products.routes.js";
import { productImagesRouter } from "./modules/products/product-images.routes.js";
import { settingsRouter } from "./modules/settings/settings.routes.js";
import { shiftHandoverRouter } from "./modules/shift-handover/shift-handover.routes.js";
import { shiftScheduleRouter } from "./modules/shift-schedule/shift-schedule.routes.js";
import { usersRouter } from "./modules/users/users.routes.js";
import { vouchersRouter } from "./modules/vouchers/vouchers.routes.js";
import { errorHandler, notFound } from "./lib/http.js";
import { logInfo } from "./lib/logger.js";

type CorsOriginCallback = (err: Error | null, origin?: boolean | string | RegExp | Array<boolean | string | RegExp>) => void;

function normalizeOrigin(origin: string) {
  const trimmed = origin.trim();
  const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    return new URL(withScheme).origin.toLowerCase();
  } catch {
    return trimmed.replace(/\/$/, "").toLowerCase();
  }
}

const allowedClientOrigins = new Set(
  [
    ...config.clientUrl.split(","),
    ...config.corsOrigins.split(","),
    "https://micinegoesti.ro",
    "https://www.micinegoesti.ro",
    config.vercel.url,
    config.vercel.branchUrl,
    config.vercel.projectProductionUrl
  ]
    .map(normalizeOrigin)
    .filter(Boolean)
);
const healthPayload = { ok: true, service: "mici-de-negoesti-api" };

function corsOrigin(requestOrigin: string | undefined, callback: CorsOriginCallback) {
  if (!requestOrigin) {
    callback(null, false);
    return;
  }

  if (allowedClientOrigins.has(normalizeOrigin(requestOrigin))) {
    callback(null, requestOrigin);
    return;
  }

  callback(null, false);
}

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);
  app.use(helmetModule.default());
  app.use(
    cors({
      origin: corsOrigin,
      credentials: true
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(
    morgan(config.nodeEnv === "production" ? "combined" : "dev", {
      stream: {
        write: (message) => logInfo("http:request", { message: message.trim() })
      }
    })
  );
  app.use(attachUser);

  app.get("/", (_req, res) => {
    res.json(healthPayload);
  });

  app.get("/api/health", (_req, res) => {
    res.json(healthPayload);
  });

  app.use(feedbackFlowRouter);
  app.use("/api", feedbackFlowRouter);

  app.use("/api", authRouter);
  app.use("/api", settingsRouter);
  app.use("/api", productsRouter);
  app.use("/api", productImagesRouter);
  app.use("/api", deliveryRouter);
  app.use("/api", cartRouter);
  app.use("/api", gameRouter);
  app.use("/api", ordersRouter);
  app.use("/api", vouchersRouter);
  app.use("/api", usersRouter);
  app.use("/api", feedbackRouter);
  app.use("/api", logsRouter);
  app.use("/api", shiftHandoverRouter);
  app.use("/api", shiftScheduleRouter);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
