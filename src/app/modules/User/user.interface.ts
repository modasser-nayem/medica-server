import { z } from "zod";
import { userSchemaValidation } from "./user.validation";
import { PaginationQuery } from "../../../utils/pagination";
import { UserRole, UserStatus } from "@prisma/client";

export type TUpdateUserProfile = z.infer<
  typeof userSchemaValidation.updateUserProfile
>;

export interface TGetUsersFilter extends PaginationQuery {
  search?: string;
  status?: UserStatus;
  role?: UserRole;
}
