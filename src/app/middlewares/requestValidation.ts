import { ZodSchema } from "zod";
import { asyncHandler } from "../../shared/catchAsync";

const requestValidate = (schema: ZodSchema) => {
  return asyncHandler(async (req, _res, next) => {
    const result = await schema.parseAsync({
      body: req.body,
      query: req.query,
      params: req.params,
    });
    req.body = result.body;
    req.query = result.query;
    req.params = result.params;
    next();
  });
};

export default requestValidate;

// import { Router } from "express";
// import requestValidate from "../../middlewares/requestValidation";
// import { userSchemaValidation } from "./user.validation";
// import { userController } from "./user.controller";

// const router = Router();

// router.patch(
//   "/status/:id",
//   requestValidate(updateUserStatusSchema), // Validates params, body, and query at once
//   userController.updateUserStatus
// );

// import { z } from "zod";

// const updateUserStatusSchema = z.object({
//   // 1. Validate route params (e.g., /users/status/:id)
//   params: z.object({
//     id: z.string().uuid("Invalid user ID in route parameters"),
//   }),

//   // 2. Validate request body
//   body: z.object({
//     status: z.enum(["ACTIVE", "DEACTIVATED"]),
//   }),

//   // 3. Validate query string (e.g., ?sendEmail=true)
//   query: z.object({
//     sendEmail: z.enum(["true", "false"]).optional(),
//   }),
// });
