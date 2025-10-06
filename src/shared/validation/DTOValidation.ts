import { z } from 'zod';
import { UserEmailSchema, UserNameSchema, UserIdSchema } from '../validation/UserValidation';

/**
 * Request DTO Schemas using Zod
 * These schemas are used for API request validation only
 * Response validation is not needed as we control the output
 */

// User-related request schemas
export const CreateUserRequestSchema = z.object({
  email: UserEmailSchema,
  name: UserNameSchema,
});

export const UpdateUserRequestSchema = z.object({
  email: UserEmailSchema.optional(),
  name: UserNameSchema.optional(),
}).refine(
  data => data.email !== undefined || data.name !== undefined,
  { message: 'At least one field (email or name) must be provided for update' }
);

export const ListUsersRequestSchema = z.object({
  page: z.number().int().min(1).optional().default(1),
  limit: z.number().int().min(1).max(100).optional().default(10),
});

// Export inferred types for requests only
export type CreateUserRequestInput = z.infer<typeof CreateUserRequestSchema>;
export type UpdateUserRequestInput = z.infer<typeof UpdateUserRequestSchema>;
export type ListUsersRequestInput = z.infer<typeof ListUsersRequestSchema>;

// Validation helper class for request DTOs only
export class DTOValidation {
  static validateCreateUserRequest(data: unknown): { success: boolean; data?: CreateUserRequestInput; error?: string } {
    const result = CreateUserRequestSchema.safeParse(data);
    if (result.success) {
      return { success: true, data: result.data };
    }
    return { 
      success: false, 
      error: result.error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
    };
  }

  static validateUpdateUserRequest(data: unknown): { success: boolean; data?: UpdateUserRequestInput; error?: string } {
    const result = UpdateUserRequestSchema.safeParse(data);
    if (result.success) {
      return { success: true, data: result.data };
    }
    return { 
      success: false, 
      error: result.error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
    };
  }

  static validateListUsersRequest(data: unknown): { success: boolean; data?: ListUsersRequestInput; error?: string } {
    const result = ListUsersRequestSchema.safeParse(data);
    if (result.success) {
      return { success: true, data: result.data };
    }
    return { 
      success: false, 
      error: result.error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
    };
  }

  static validateUserId(id: unknown): { success: boolean; data?: string; error?: string } {
    const result = UserIdSchema.safeParse(id);
    if (result.success) {
      return { success: true, data: result.data };
    }
    return { 
      success: false, 
      error: result.error.issues[0]?.message || 'Invalid user ID'
    };
  }
}