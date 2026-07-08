import { asyncHandler } from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { departmentService } from "./department.service";

const createDepartment = asyncHandler(async (req, res) => {
  const result = await departmentService.createDepartment(req.body);

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: "Department created successfully",
    data: result,
  });
});

const getAllDepartments = asyncHandler(async (req, res) => {
  const result = await departmentService.getAllDepartments();

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Departments retrieved successfully",
    data: result,
  });
});

const getDepartmentById = asyncHandler(async (req, res) => {
  const result = await departmentService.getDepartmentById(req.params.id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Department retrieved successfully",
    data: result,
  });
});

const updateDepartment = asyncHandler(async (req, res) => {
  const result = await departmentService.updateDepartment({
    id: req.params.id,
    data: req.body,
  });
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Department updated successfully",
    data: result,
  });
});

const deleteDepartment = asyncHandler(async (req, res) => {
  const result = await departmentService.deleteDepartment(req.params.id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Department deleted successfully",
    data: result,
  });
});

export const departmentController = {
  createDepartment,
  getAllDepartments,
  getDepartmentById,
  updateDepartment,
  deleteDepartment,
};
