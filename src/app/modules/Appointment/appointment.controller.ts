import { asyncHandler } from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { appointmentService } from "./appointment.service";

const createAppointment = asyncHandler(async (req, res) => {
  const result = await appointmentService.createAppointment(req.body);

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: "Appointment created successfully",
    data: result,
  });
});

const getAppointments = asyncHandler(async (req, res) => {
  const result = await appointmentService.getAppointments({
    userId: req.user.profileId,
    filters: req.query,
  });

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Appointments Successfully Retrieved",
    data: result.data,
    pagination: result.pagination,
  });
});

const getAppointmentDetails = asyncHandler(async (req, res) => {
  const result = await appointmentService.getAppointmentDetails(req.params.id);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Appointment Successfully Retrieved",
    data: result,
  });
});

const rescheduleAppointment = asyncHandler(async (req, res) => {
  const result = await appointmentService.rescheduleAppointment({
    data: req.body,
    appointmentId: req.params.id,
  });

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: "Appointment Successfully Rescheduled",
    data: result,
  });
});

const cancelAppointment = asyncHandler(async (req, res) => {
  const result = await appointmentService.cancelAppointment({
    data: req.body,
    appointmentId: req.params.id,
    userRole: req.user.role!,
  });

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Appointment Successfully Canceled",
    data: result,
  });
});

const deleteAppointment = asyncHandler(async (req, res) => {
  const result = await appointmentService.deleteAppointment(req.params.id);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Appointment Successfully Deleted",
    data: result,
  });
});

const requestReschedule = asyncHandler(async (req, res) => {
  const result = await appointmentService.requestReschedule({
    appointmentId: req.params.id,
    userRole: req.user.role!,
    data: req.body,
  });

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: "Reschedule request created successfully",
    data: result,
  });
});

const approveReschedule = asyncHandler(async (req, res) => {
  const result = await appointmentService.approveReschedule({
    appointmentId: req.params.id,
    requestId: req.params.requestId,
    userRole: req.user.role!,
  });

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Reschedule request approved successfully",
    data: result,
  });
});

const rejectReschedule = asyncHandler(async (req, res) => {
  const result = await appointmentService.rejectReschedule({
    appointmentId: req.params.id,
    requestId: req.params.requestId,
    userRole: req.user.role!,
    data: req.body,
  });

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Reschedule request rejected successfully",
    data: result,
  });
});

export const appointmentController = {
  createAppointment,
  getAppointments,
  getAppointmentDetails,
  rescheduleAppointment,
  cancelAppointment,
  deleteAppointment,
  requestReschedule,
  approveReschedule,
  rejectReschedule,
};
