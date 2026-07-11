import express from "express";
import requestValidate from "../../middlewares/requestValidation";
import { appointmentSchemaValidation } from "./appointment.validation";
import { appointmentController } from "./appointment.controller";
import { authorize } from "../../middlewares/authorize";

const router = express.Router();

// Create appointment
router.post(
  "/",
  authorize(),
  requestValidate(appointmentSchemaValidation.createAppointment),
  appointmentController.createAppointment,
);

// Get appointments
router.get("/", authorize(), appointmentController.getAppointments);

// Get appointment details
router.get(
  "/:id",
  authorize("PATIENT", "DOCTOR"),
  appointmentController.getAppointmentDetails,
);

// Reschedule appointment
router.put(
  "/:id/reschedule",
  authorize(),
  requestValidate(appointmentSchemaValidation.rescheduleAppointment),
  appointmentController.rescheduleAppointment,
);

// Cancel appointment
router.patch(
  "/:id/cancel",
  authorize(),
  requestValidate(appointmentSchemaValidation.cancelAppointment),
  appointmentController.cancelAppointment,
);

// Delete appointment
router.delete("/:id", authorize(), appointmentController.deleteAppointment);

export const appointmentRoutes = router;
