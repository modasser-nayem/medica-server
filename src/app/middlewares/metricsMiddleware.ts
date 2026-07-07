import { Request, Response, NextFunction } from "express";
import { metricsHelper } from "../../utils/metrics";

export function metricsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const end = process.hrtime.bigint();
    const durationSeconds = Number(end - start) / 1e9;

    // req.route?.path gives you "/login" instead of the raw URL with IDs in it —
    // important! Without this, "/users/123" and "/users/456" become separate
    // labels, exploding your metric cardinality.
    const route = req.route?.path
      ? `${req.baseUrl}${req.route.path}`
      : req.path;

    metricsHelper.httpRequestDuration
      .labels(req.method, route, String(res.statusCode))
      .observe(durationSeconds);

    metricsHelper.httpRequestTotal
      .labels(req.method, route, String(res.statusCode))
      .inc();
  });

  next();
}
