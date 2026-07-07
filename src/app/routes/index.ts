import { Router } from "express";
import { authRoutes } from "../modules/Auth/auth.routes";

const routers = Router();

const moduleRoutes: { path: string; route: Router }[] = [
  {
    path: "/auth",
    route: authRoutes,
  },
];

moduleRoutes.forEach((route) => routers.use(route.path, route.route));

export default routers;
