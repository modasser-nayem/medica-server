import express from "express";
import { authorize } from "../../middlewares/authorize";
import requestValidate from "../../middlewares/requestValidation";
import { consultationValidation } from "./consultation.validation";
import { consultationController } from "./consultation.controller";

const router = express.Router();

// initiate voice or video call
router.post(
  "/calls",
  authorize("PATIENT", "DOCTOR"),
  requestValidate(consultationValidation.initiateCall),
  consultationController.initiateCall,
);

// get call details
router.get(
  "/calls/:callId",
  authorize("PATIENT", "DOCTOR"),
  consultationController.getCallDetails,
);

// get/refresh Agora RTC token
router.get(
  "/calls/:callId/token",
  authorize("PATIENT", "DOCTOR"),
  consultationController.getAgoraToken,
);

// end the call
router.post(
  "/calls/:callId/end",
  authorize("PATIENT", "DOCTOR"),
  consultationController.endCall,
);

// complete consultation
router.post(
  "/:appointmentId/complete",
  authorize("DOCTOR"),
  consultationController.completeConsultation,
);

export const consultationRoutes = router;
