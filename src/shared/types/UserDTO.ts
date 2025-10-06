import { UserInfo } from './UserInfo';

/**
 * User Data Transfer Object for API responses
 * Separate from domain entity to maintain Clean Architecture
 */
export interface UserDTO {
  id: string;
  email: string;
  name: string;
  createdAt: string;  // ISO string for API consistency
  updatedAt: string;  // ISO string for API consistency
  createdBy?: UserInfo;
  updatedBy?: UserInfo;
  deletedBy?: UserInfo;
}

/**
 * User mapper utility for converting entities to DTOs
 */
export class UserMapper {
  static toDTO(user: any): UserDTO {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt?.toISOString() || user.created_at?.toISOString(),
      updatedAt: user.updatedAt?.toISOString() || user.updated_at?.toISOString(),
      createdBy: user.createdBy,
      updatedBy: user.updatedBy,
      deletedBy: user.deletedBy,
    };
  }

  static toDTOs(users: any[]): UserDTO[] {
    return users.map(this.toDTO);
  }
}