import client from "prom-client";

const projectName = "medica";

// Collects default Node.js metrics: heap usage, event loop lag, GC stats, etc.
client.collectDefaultMetrics({ prefix: `${projectName}_` });

// Custom metric #1: how long each request takes, bucketed by route/method/status
const httpRequestDuration = new client.Histogram({
  name: `${projectName}_http_request_duration_seconds`,
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5], // tune later based on real data
});

// Custom metric #2: total requests, bucketed the same way (useful for rate/error-rate queries)
const httpRequestTotal = new client.Counter({
  name: `${projectName}_http_requests_total`,
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status_code"],
});

// Custom metric #3: something specific to YOUR app — failed login attempts
const loginAttemptsTotal = new client.Counter({
  name: `${projectName}_login_attempts_total`,
  help: "Total login attempts, labeled by outcome",
  labelNames: ["outcome"], // "success" | "failure"
});

const registerMetrics = client.register;

export const metricsHelper = {
  registerMetrics,
  httpRequestDuration,
  httpRequestTotal,
  loginAttemptsTotal,
};
