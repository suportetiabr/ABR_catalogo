import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import winston from "winston";
import compression from "compression";

import productRoutes from "./routes/productRoutes.js";
import { notFound } from "./middlewares/notFound.js";
import { errorHandler } from "./middlewares/errorHandler.js";
import { getPoolStatus, query } from "./config/db.js";
import { preloadCatalog } from "./services/products/productService.js";

dotenv.config();

const app = express();

const isProduction = process.env.NODE_ENV === "production";

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: "abr-catalogo-backend" },
  transports: [
    new winston.transports.Console({
      format: isProduction
        ? winston.format.combine(
          winston.format.timestamp(),
          winston.format.errors({ stack: true }),
          winston.format.json()
        )
        : winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        ),
    }),
  ],
});

app.set("trust proxy", true);

const allowedFrontendUrls = process.env.ALLOWED_FRONTEND_URL
  ? process.env.ALLOWED_FRONTEND_URL.split(",").map((s) => s.trim()).filter(Boolean)
  : ["https://abr-catalogo.vercel.app", "http://localhost:3000", "http://localhost:4173"];

app.use(
  helmet({
    contentSecurityPolicy: false,
    hsts: isProduction
      ? {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      }
      : false,
  })
);

app.use(compression());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many requests from this IP, please try again later.",
  },
  handler: (req, res) => {
    logger.warn("Rate limit exceeded", {
      ip: req.ip,
      path: req.path,
      method: req.method,
    });

    res.status(429).json({
      error: "Too many requests from this IP, please try again later.",
    });
  },
});

app.use(limiter);

const configuredCors = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((s) => s.trim()).filter(Boolean)
  : process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

const allowedOrigins =
  configuredCors.length > 0 ? configuredCors : ["https://abr-catalogo.vercel.app"];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    try {
      const parsed = new URL(origin);
      const host = parsed.hostname;

      if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
        return callback(null, true);
      }
    } catch {
      // ignore
    }

    logger.warn("CORS blocked request", { origin });
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  maxAge: 86400,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ limit: "1mb", extended: true }));

app.use((req, res, next) => {
  req.id = `${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`;
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;

    const logData = {
      requestId: req.id,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      ip: req.ip,
      userAgent: req.get("User-Agent"),
    };

    if (res.statusCode >= 500) {
      logger.error("Request failed", logData);
    } else if (res.statusCode >= 400) {
      logger.warn("Request warning", logData);
    } else {
      logger.info("Request completed", logData);
    }
  });

  next();
});

app.get("/health", (req, res) => {
  const poolStatus = getPoolStatus();

  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    database: {
      activeConnections: poolStatus.activeConnections,
      idleConnections: poolStatus.idleConnections,
      waitingQueue: poolStatus.waitingQueue,
    },
  });
});

function normalizeAnalyticsPayload(req) {
  const body = req.body || {};

  return {
    sessionId: typeof body.sessionId === "string" ? body.sessionId.trim().slice(0, 120) : null,
    language: typeof body.language === "string" ? body.language.trim().slice(0, 20) : null,
    platform: typeof body.platform === "string" ? body.platform.trim().slice(0, 50) : null,
    url: typeof body.url === "string" ? body.url.trim().slice(0, 2048) : null,
    referrer: typeof body.referrer === "string" ? body.referrer.trim().slice(0, 2048) : null,
    timestamp: typeof body.timestamp === "string" ? body.timestamp : null,
    ip: req.ip || null,
    userAgent: req.get("User-Agent") || null,
    latitude:
      body.location && typeof body.location.latitude === "number"
        ? body.location.latitude
        : null,
    longitude:
      body.location && typeof body.location.longitude === "number"
        ? body.location.longitude
        : null,
  };
}

app.post("/api/log", async (req, res) => {
  try {
    const logData = normalizeAnalyticsPayload(req);

    logger.info("Analytics log received", {
      sessionId: logData.sessionId,
      ip: logData.ip,
      language: logData.language,
      platform: logData.platform,
      url: logData.url,
      referrer: logData.referrer,
      userAgent: logData.userAgent,
    });

    if (!logData.sessionId) {
      return res.status(200).json({
        success: false,
        ignored: true,
        reason: "missing_session_id",
      });
    }

    const sql = `
      INSERT INTO analytics_logs (
        session_id,
        event_date,
        client_ip,
        public_ip,
        user_agent,
        browser_language,
        platform,
        current_url,
        referrer,
        location_lat,
        location_lng,
        created_at,
        updated_at
      )
      VALUES (?, CURDATE(), ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      ON DUPLICATE KEY UPDATE
        public_ip = VALUES(public_ip),
        client_ip = VALUES(client_ip),
        user_agent = VALUES(user_agent),
        browser_language = VALUES(browser_language),
        platform = VALUES(platform),
        current_url = VALUES(current_url),
        referrer = VALUES(referrer),
        location_lat = VALUES(location_lat),
        location_lng = VALUES(location_lng),
        updated_at = NOW()
    `;

    const params = [
      logData.sessionId,
      logData.ip,
      logData.ip,
      logData.userAgent,
      logData.language,
      logData.platform,
      logData.url,
      logData.referrer,
      logData.latitude,
      logData.longitude,
    ];

    await query(sql, params);

    return res.status(200).json({ success: true });
  } catch (error) {
    logger.error("Error saving analytics log", {
      error: error.message,
      code: error.code,
      requestId: req.id,
      path: req.path,
      sessionId: req.body?.sessionId || null,
    });

    return res.status(200).json({
      success: false,
      ignored: true,
      reason: "analytics_write_failed",
    });
  }
});

app.get("/api/analytics/logs", async (req, res) => {
  try {
    const sql = `
      SELECT
        id,
        session_id,
        event_date,
        client_ip,
        public_ip,
        user_agent,
        browser_language,
        platform,
        current_url,
        referrer,
        location_lat,
        location_lng,
        created_at,
        updated_at
      FROM analytics_logs
      ORDER BY created_at DESC
      LIMIT 1000
    `;

    const results = await query(sql);
    res.json({ logs: results });
  } catch (error) {
    logger.error("Error fetching analytics logs", {
      error: error.message,
      code: error.code,
      requestId: req.id,
    });

    res.status(500).json({ error: "Failed to fetch logs" });
  }
});

app.use("/api", productRoutes);

app.use(notFound);
app.use(errorHandler(logger));

preloadCatalog().catch((err) => {
  logger.error("Erro no preload do catálogo", {
    error: err?.message || String(err),
  });
});

export default app;