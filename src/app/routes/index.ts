import { Router } from "express";
import { authRoutes } from "../modules/Auth/auth.routes";
import { paymentRoutes } from "../modules/Payment/payment.routes";
import { userRoutes } from "../modules/User/user.routes";
import { doctorRoutes } from "../modules/Doctor/doctor.routes";
import { appointmentRoutes } from "../modules/Appointment/appointment.routes";
import { departmentRoutes } from "../modules/Department/department.routes";
import { scheduleRoutes } from "../modules/Schedule/schedule.routes";

const routers = Router();

const moduleRoutes: { path: string; route: Router }[] = [
  {
    path: "/auth",
    route: authRoutes,
  },
  {
    path: "/users",
    route: userRoutes,
  },
  {
    path: "/doctors",
    route: doctorRoutes,
  },
  {
    path: "/schedules",
    route: scheduleRoutes,
  },
  {
    path: "/departments",
    route: departmentRoutes,
  },
  {
    path: "/appointments",
    route: appointmentRoutes,
  },
  {
    path: "/payments",
    route: paymentRoutes,
  },
];

moduleRoutes.forEach((route) => routers.use(route.path, route.route));

export default routers;
