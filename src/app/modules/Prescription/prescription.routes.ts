import express from "express";
import { authorize } from "../../middlewares/authorize";
import requestValidate from "../../middlewares/requestValidation";
import { prescriptionSchemaValidation } from "./prescription.validation";
import { prescriptionController } from "./prescription.controller";

const router = express.Router();

router.post(
  "/",
  authorize("DOCTOR"),
  requestValidate(prescriptionSchemaValidation.createPrescription),
  prescriptionController.createPrescription
);

router.get(
  "/:id",
  authorize("PATIENT", "DOCTOR"),
  prescriptionController.getPrescriptionById
);

router.get(
  "/patient/:patientId",
  authorize("PATIENT", "DOCTOR"),
  prescriptionController.getPatientPrescriptions
);

export const prescriptionRoutes = router;
