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

// Request a reschedule ping-pong
router.post(
  "/:id/reschedule-request",
  authorize("PATIENT", "DOCTOR"),
  requestValidate(appointmentSchemaValidation.requestReschedule),
  appointmentController.requestReschedule,
);

// Approve a reschedule request
router.post(
  "/:id/reschedule-requests/:requestId/approve",
  authorize("PATIENT", "DOCTOR"),
  appointmentController.approveReschedule,
);

// Reject a reschedule request
router.post(
  "/:id/reschedule-requests/:requestId/reject",
  authorize("PATIENT", "DOCTOR"),
  requestValidate(appointmentSchemaValidation.rejectReschedule),
  appointmentController.rejectReschedule,
);

// Delete appointment
router.delete("/:id", authorize(), appointmentController.deleteAppointment);

export const appointmentRoutes = router;
