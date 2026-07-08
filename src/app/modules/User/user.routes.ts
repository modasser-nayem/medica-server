import { Router } from "express";
import { userController } from "./user.controller";
import { authorize } from "../../middlewares/authorize";
import requestValidate from "../../middlewares/requestValidation";
import { userSchemaValidation } from "./user.validation";
import { uploadImageMiddleware } from "../../../upload/fileUpload";

const router = Router();

// GET /users/profile — get logged-in user's full profile
router.get("/profile", authorize(), userController.getUserProfile);

// PUT /users/user-profile — update basic info + optional profile image
// Frontend: multipart/form-data with field "profileImage" (optional)
router.put(
  "/user-profile",
  authorize(),
  uploadImageMiddleware.single("profileImage"),
  requestValidate(userSchemaValidation.updateUserProfile),
  userController.updateUserInformation,
);

// PUT /users/patient-profile — update patient-specific fields
router.put(
  "/patient-profile",
  authorize("PATIENT"),
  requestValidate(userSchemaValidation.updatePatientProfile),
  userController.updatePatientProfile,
);

// PUT /users/doctor-profile — update doctor-specific fields
router.put(
  "/doctor-profile",
  authorize("DOCTOR"),
  requestValidate(userSchemaValidation.updateDoctorProfile),
  userController.updateDoctorProfile,
);

// GET /users — list all users (admin only)
router.get("/", authorize("ADMIN"), userController.getUsers);

// PATCH /users/status/:id — toggle user active status (admin only)
router.patch(
  "/status/:id",
  authorize("ADMIN"),
  userController.updateUserStatus,
);

// DELETE /users/:id — soft-delete a user (admin only)
router.delete("/:id", authorize("ADMIN"), userController.deleteUser);

export const userRoutes = router;
