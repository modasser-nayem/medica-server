import { JwtPayload } from "jsonwebtoken";
import { TSignTokenPayload } from "../shared/jwtHelpers";

declare global {
  namespace Express {
    interface Request {
      user: JwtPayload & TSignTokenPayload;
    }
  }
}
