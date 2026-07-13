import { asyncHandler } from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { consultationService } from "./consultation.service";

// initiate call
const initiateCall = asyncHandler(async (req, res) => {
  const result = await consultationService.initiateCall({
    appointmentId: req.body.appointmentId,
    type: req.body.type,
    userId: req.user.userId!,
    userProfileId: req.user.profileId!,
  });

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: "Call initiated successfully",
    data: result,
  });
});

// get agora token
const getAgoraToken = asyncHandler(async (req, res) => {
  const result = await consultationService.getAgoraToken({
    callId: req.params.callId,
    userProfileId: req.user.profileId!,
  });

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Agora token generated successfully",
    data: result,
  });
});

// get call details
const getCallDetails = asyncHandler(async (req, res) => {
  const result = await consultationService.getCallDetails(
    req.params.callId,
    req.user.profileId!,
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Call details retrieved successfully",
    data: result,
  });
});

// end call
const endCall = asyncHandler(async (req, res) => {
  const result = await consultationService.endCall(
    req.params.callId,
    req.user.profileId!,
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Call ended successfully",
    data: result,
  });
});

// mark consultation completed
const completeConsultation = asyncHandler(async (req, res) => {
  const result = await consultationService.completeConsultation(
    req.params.appointmentId,
    req.user.profileId!,
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Consultation marked as completed successfully",
    data: result,
  });
});

export const consultationController = {
  initiateCall,
  getAgoraToken,
  getCallDetails,
  endCall,
  completeConsultation,
};
