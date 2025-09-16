export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
  MODERATOR = 'moderator',
}

export enum Permission {
  // User permissions
  CREATE_USER = 'create:user',
  READ_USER = 'read:user',
  UPDATE_USER = 'update:user',
  DELETE_USER = 'delete:user',
  LIST_USERS = 'list:users',
  
  // Admin permissions
  MANAGE_SYSTEM = 'manage:system',
  VIEW_ANALYTICS = 'view:analytics',
  MANAGE_ROLES = 'manage:roles',
}

export const RolePermissions: Record<UserRole, Permission[]> = {
  [UserRole.ADMIN]: [
    Permission.CREATE_USER,
    Permission.READ_USER,
    Permission.UPDATE_USER,
    Permission.DELETE_USER,
    Permission.LIST_USERS,
    Permission.MANAGE_SYSTEM,
    Permission.VIEW_ANALYTICS,
    Permission.MANAGE_ROLES,
  ],
  [UserRole.MODERATOR]: [
    Permission.CREATE_USER,
    Permission.READ_USER,
    Permission.UPDATE_USER,
    Permission.LIST_USERS,
  ],
  [UserRole.USER]: [
    Permission.READ_USER,
  ],
};
