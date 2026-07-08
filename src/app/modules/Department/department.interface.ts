import { PaginationQuery } from "../../../utils/pagination";

export type TCreateDepartment = {
  name: string;
  icon?: string;
  description?: string;
};

export type TUpdateDepartment = {
  id: string;
  data: Partial<TCreateDepartment>;
};

export interface TGetDepartmentsFilter extends PaginationQuery {
  search?: string;
}
