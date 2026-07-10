import { PaginationQuery } from "../../../utils/pagination";

export interface TGetDoctorsFilter extends PaginationQuery {
  search?: string;
  department?: string;
  specialty?: string;
  rating?: number;
  sortBy?: "rating" | "createdAt";
}
