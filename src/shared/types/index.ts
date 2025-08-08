import { UserInfo } from './UserInfo';

export interface TraceMetadata {
  traceId: string;
  spanId: string;
}

export interface CreateUserRequest {
  email: string;
  name: string;
  createdBy?: UserInfo;
}

export interface CreateUserResponse {
  id: string;
  message: string;
}

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
    updatedAt: string;
    createdBy?: UserInfo;
    updatedBy?: UserInfo;
    deletedBy?: UserInfo;
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface UpdateUserRequest {
  id: string;
  email?: string;
  name?: string;
  updatedBy?: UserInfo;
}

export interface UpdateUserResponse {
  id: string;
  message: string;
  version: number;
}

export interface DeleteUserRequest {
  id: string;
  deletedBy?: UserInfo;
}

export interface DeleteUserResponse {
  id: string;
  message: string;
  version: number;
}

export interface UserCreatedEvent {
  userId: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface OutboxEventData {
  eventType: string;
  eventData: any;
  metadata?: TraceMetadata;
}
