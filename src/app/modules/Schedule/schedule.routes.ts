import express from "express";
import requestValidate from "../../middlewares/requestValidation";
import { scheduleSchemaValidation } from "./schedule.validation";
import { scheduleController } from "./schedule.controller";
import { authorize } from "../../middlewares/authorize";

const router = express.Router();

// Create schedule for a doctor
router.post(
  "/",
  authorize("DOCTOR"),
  requestValidate(scheduleSchemaValidation.createSchedule),
  scheduleController.createSchedule,
);

// Get schedules
router.get("/", authorize("DOCTOR"), scheduleController.getSchedules);

// Update schedule
router.put(
  "/",
  authorize("DOCTOR"),
  requestValidate(scheduleSchemaValidation.updateSchedule),
  scheduleController.updateSchedule,
);

// Delete schedule
router.delete("/:id", authorize("DOCTOR"), scheduleController.deleteSchedule);

// Create schedule Exception
router.post(
  "/exception",
  authorize("DOCTOR"),
  requestValidate(scheduleSchemaValidation.createScheduleException),
  scheduleController.createScheduleException,
);

// Get schedule Exceptions
router.get(
  "/exception",
  authorize("DOCTOR"),
  scheduleController.getScheduleExceptions,
);

// Delete schedule Exceptions
router.delete(
  "/exception/:id",
  authorize("DOCTOR"),
  scheduleController.deleteScheduleException,
);

export const scheduleRoutes = router;
