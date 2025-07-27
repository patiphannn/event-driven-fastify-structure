export interface ListUsersRequest {
  page?: number;
  limit?: number;
}

export interface ListUsersResponse {
  users: Array<{
    id: string;
    email: string;
    name: string;
    createdAt: string;
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
