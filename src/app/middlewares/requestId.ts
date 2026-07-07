import { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { requestContext } from "../../utils/requestContext";

export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const requestId = (req.headers["x-request-id"] as string) || randomUUID();
  res.setHeader("x-request-id", requestId);

  requestContext.run({ requestId }, () => {
    next();
  });
}
