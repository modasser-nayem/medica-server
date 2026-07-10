import { asyncHandler } from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { doctorService } from "./doctor.service";

// Get Doctors
const getDoctors = asyncHandler(async (req, res) => {
  const result = await doctorService.getDoctors(req.query);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Successfully retrieved doctors",
    data: result.data,
    pagination: result.pagination,
  });
});

// Get Doctor Details
const getDoctorDetails = asyncHandler(async (req, res) => {
  const result = await doctorService.getDoctorDetails(req.params.id);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Successfully retrieved doctor details",
    data: result,
  });
});

const getDoctorSlots = asyncHandler(async (req, res) => {
  const result = await doctorService.getDoctorAvailableSlots(req.params.id);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: "Successfully Retrieved Doctor Slots",
    data: result,
  });
});

export const doctorController = {
  getDoctors,
  getDoctorDetails,
  getDoctorSlots,
};
