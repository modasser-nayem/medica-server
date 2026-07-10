import { z } from "zod";
import { departmentSchemaValidation } from "./department.validation";
import { PaginationQuery } from "../../../utils/pagination";

export type TCreateDepartment = z.infer<
  typeof departmentSchemaValidation.createDepartment
>["body"];

export type TUpdateDepartment = z.infer<
  typeof departmentSchemaValidation.updateDepartment
>["body"];

export interface TGetDepartmentsFilter extends PaginationQuery {
  search?: string;
}
