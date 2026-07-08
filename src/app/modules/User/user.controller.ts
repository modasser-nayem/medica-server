import sendResponse from "../../../shared/sendResponse";
import { userService } from "./user.service";
import { asyncHandler } from "../../../shared/catchAsync";
import { FileUploadHelper, UploadFolder } from "../../../upload/fileUpload";

// Get user profile
const getUserProfile = asyncHandler(async (req, res) => {
  const result = await userService.getUserProfile(req.user.userId);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "User profile retrieved successfully",
    data: result,
  });
});

// Update User Information (supports optional profile image via multipart/form-data)
const updateUserInformation = asyncHandler(async (req, res) => {
  // Upload profile image to Cloudinary if provided
  const uploaded = await FileUploadHelper.uploadSingle(
    req.file as Express.Multer.File,
    {
      folderName: UploadFolder.PROFILE_IMAGES,
      required: false,
    },
  );

  const data = {
    ...req.body,
    ...(uploaded && { profileImage: uploaded.secure_url }),
  };

  const result = await userService.updateUserInformation({
    userId: req.user.userId,
    data,
  });

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Profile successfully updated",
    data: result,
  });
});

// Update Patient Profile
const updatePatientProfile = asyncHandler(async (req, res) => {
  const result = await userService.updatePatientProfile({
    userId: req.user.userId,
    data: req.body,
  });

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Profile successfully updated",
    data: result,
  });
});

// Update Doctor Profile
const updateDoctorProfile = asyncHandler(async (req, res) => {
  const result = await userService.updateDoctorProfile({
    userId: req.user.userId,
    data: req.body,
  });

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Profile successfully updated",
    data: result,
  });
});

// Get Users
const getUsers = asyncHandler(async (req, res) => {
  const result = await userService.getUsers(req.query);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Successfully retrieved users",
    data: result.data,
    pagination: result.pagination,
  });
});

// Update User Status
const updateUserStatus = asyncHandler(async (req, res) => {
  const result = await userService.updateUserStatus(req.params.id);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "User Status Successfully Updated",
    data: result,
  });
});

// Delete User
const deleteUser = asyncHandler(async (req, res) => {
  const result = await userService.deleteUser(req.params.id);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "User Account Successfully Deleted",
    data: result,
  });
});

export const userController = {
  getUserProfile,
  updateUserInformation,
  updatePatientProfile,
  updateDoctorProfile,
  getUsers,
  updateUserStatus,
  deleteUser,
};
