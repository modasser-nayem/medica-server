import { asyncHandler } from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { scheduleService } from "./schedule.service";

const createSchedule = asyncHandler(async (req, res) => {
  const result = await scheduleService.createSchedule({
    doctorId: req.user.profileId!,
    data: req.body,
  });

  sendResponse(res, {
    success: true,
    statusCode: 201,
    message: "Schedule created successfully",
    data: result,
  });
});

const getSchedules = asyncHandler(async (req, res) => {
  const result = await scheduleService.getSchedules(req.user.profileId!);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Schedules retrieved successfully",
    data: result,
  });
});

const updateSchedule = asyncHandler(async (req, res) => {
  const result = await scheduleService.updateSchedule(
    req.user.profileId!,
    req.body,
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Schedule updated successfully",
    data: result,
  });
});

const deleteSchedule = asyncHandler(async (req, res) => {
  const result = await scheduleService.deleteSchedule(
    req.user.profileId!,
    req.params.id,
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Schedule deleted successfully",
    data: result,
  });
});

const createScheduleException = asyncHandler(async (req, res) => {
  const result = await scheduleService.createScheduleException({
    doctorId: req.user.profileId!,
    data: req.body,
  });
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: "Schedule exception successfully created",
    data: result,
  });
});

const getScheduleExceptions = asyncHandler(async (req, res) => {
  const result = await scheduleService.getScheduleExceptions({
    doctorId: req.user.profileId!,
  });
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Schedule exceptions successfully retrieved",
    data: result,
  });
});

const deleteScheduleException = asyncHandler(async (req, res) => {
  const result = await scheduleService.deleteScheduleException(req.params.id);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Schedule Exception successfully Deleted",
    data: result,
  });
});

export const scheduleController = {
  createSchedule,
  getSchedules,
  updateSchedule,
  deleteSchedule,
  createScheduleException,
  getScheduleExceptions,
  deleteScheduleException,
};
