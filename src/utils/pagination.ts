export type TMetaData = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export interface PaginationQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: TMetaData;
}

export type IPaginationOptions = {
  page?: number | string;
  limit?: number | string;
  sortBy?: string;
  sortOrder?: string;
};

export type IOptionsResult = {
  page: number;
  limit: number;
  skip: number;
  sortBy: string;
  sortOrder: "asc" | "desc";
};

const calculatePagination = (options: IPaginationOptions): IOptionsResult => {
  const page: number = Number(options.page) || 1;
  const limit: number = Number(options.limit) || 10;
  const skip: number = (page - 1) * limit;

  const sortBy: string = options.sortBy || "createdAt";
  let sortOrder: "asc" | "desc" = "desc";
  if (options.sortOrder === "asc" || options.sortOrder === "desc") {
    sortOrder = options.sortOrder;
  }

  return {
    page,
    limit,
    skip,
    sortBy,
    sortOrder,
  };
};

export const paginationHelper = {
  calculatePagination,
};
