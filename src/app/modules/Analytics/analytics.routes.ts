import { Router } from "express";
import { analyticsController } from "./analytics.controller";
import { authorize } from "../../middlewares/authorize";

const router = Router();

// Admin Stats
router.get(
  "/admin-stats",
  authorize("ADMIN"),
  analyticsController.getAdminStats,
);

// Doctor Stats
router.get(
  "/doctor-stats",
  authorize("DOCTOR"),
  analyticsController.getDoctorStats,
);

// Patient Stats
router.get(
  "/patient-stats",
  authorize("PATIENT"),
  analyticsController.getPatientStats,
);

// Public Stats
router.get("/public-stats", analyticsController.getPublicStats);

// Get user activity
router.get(
  "/users-activities",
  authorize("ADMIN"),
  analyticsController.getUserActivity,
);

export const analyticsRouters = router;
