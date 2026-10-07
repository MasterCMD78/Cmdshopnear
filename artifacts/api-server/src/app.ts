import express, { type ErrorRequestHandler, type Express } from "express";
import pinoHttp from "pino-http";
import cookieParser from "cookie-parser";
import router from "./routes";
import { logger } from "./lib/logger";
import { analyticsTracking } from "./lib/analytics";
import { isCrossOriginMutation, setApiSecurityHeaders } from "./lib/http-security.mjs";

const app: Express = express();
app.disable("x-powered-by");

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use((req, res, next) => {
  setApiSecurityHeaders(res, process.env.NODE_ENV === "production");
  next();
});
app.use((req, res, next) => {
  if (
    isCrossOriginMutation({
      method: req.method,
      origin: req.get("origin"),
      host: req.get("host"),
      secFetchSite: req.get("sec-fetch-site"),
    })
  ) {
    res.status(403).json({ error: "Cross-origin request denied" });
    return;
  }
  next();
});
app.use(cookieParser());
app.use(express.json({ limit: "64kb" }));
app.use(express.urlencoded({ extended: false, limit: "64kb", parameterLimit: 100 }));
app.use(analyticsTracking);

app.use("/api", router);
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});

const apiErrorHandler: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  const candidateStatus =
    typeof error === "object" && error !== null
      ? "status" in error
        ? error.status
        : "statusCode" in error
          ? error.statusCode
          : undefined
      : undefined;
  const status =
    typeof candidateStatus === "number" && candidateStatus >= 400 && candidateStatus < 500
      ? candidateStatus
      : 500;

  if (status === 500) req.log.error({ err: error }, "Unhandled API request error");
  else req.log.warn({ statusCode: status }, "API request rejected");

  res.status(status).json({
    error: status === 413 ? "Request payload is too large" : status < 500 ? "Invalid request" : "Internal server error",
  });
};

app.use(apiErrorHandler);

export default app;
