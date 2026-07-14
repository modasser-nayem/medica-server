import { asyncHandler } from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { prescriptionService } from "./prescription.service";

const createPrescription = asyncHandler(async (req, res) => {
  const result = await prescriptionService.createPrescription(
    req.user.profileId!,
    req.body
  );

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: "Prescription written successfully",
    data: result,
  });
});

const getPrescriptionById = asyncHandler(async (req, res) => {
  const result = await prescriptionService.getPrescriptionById(
    req.params.id,
    req.user.profileId!
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Prescription details retrieved successfully",
    data: result,
  });
});

const getPatientPrescriptions = asyncHandler(async (req, res) => {
  const result = await prescriptionService.getPatientPrescriptions(
    req.params.patientId,
    req.user.profileId!
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Patient prescriptions retrieved successfully",
    data: result,
  });
});

export const prescriptionController = {
  createPrescription,
  getPrescriptionById,
  getPatientPrescriptions,
};
