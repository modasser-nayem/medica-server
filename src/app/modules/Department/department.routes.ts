import express from "express";
import requestValidate from "../../middlewares/requestValidation";
import { departmentSchemaValidation } from "./department.validation";
import { departmentController } from "./department.controller";
import { authorize } from "../../middlewares/authorize";

const router = express.Router();

// Create department
router.post(
  "/",
  authorize("ADMIN"),
  requestValidate(departmentSchemaValidation.createDepartment),
  departmentController.createDepartment,
);

// Get all departments
router.get("/", departmentController.getAllDepartments);

// Get department by ID
router.get("/:id", departmentController.getDepartmentById);

// Update department by ID
router.put(
  "/:id",
  authorize("ADMIN"),
  requestValidate(departmentSchemaValidation.updateDepartment),
  departmentController.updateDepartment,
);

// Delete department by ID
router.delete(
  "/:id",
  authorize("ADMIN"),
  departmentController.deleteDepartment,
);

export const departmentRoutes = router;
