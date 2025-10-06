import { z } from 'zod';

/**
 * Base User Validation Schemas using Zod
 */

// Core field validations
export const UserEmailSchema = z
  .string()
  .transform(val => val.toLowerCase().trim())
  .pipe(
    z.string()
      .email('Invalid email format')
      .min(1, 'Email is required')
      .max(255, 'Email must be 255 characters or less')
  );

export const UserNameSchema = z
  .string()
  .transform(val => val.trim())
  .pipe(
    z.string()
      .min(2, 'Name must be at least 2 characters')
      .max(100, 'Name must be 100 characters or less')
  );

export const UserIdSchema = z
  .string()
  .uuid('Invalid user ID format');

// User entity creation schema
export const CreateUserSchema = z.object({
  email: UserEmailSchema,
  name: UserNameSchema,
});

// User entity update schema (partial)
export const UpdateUserSchema = z.object({
  email: UserEmailSchema.optional(),
  name: UserNameSchema.optional(),
}).refine(
  data => data.email !== undefined || data.name !== undefined,
  { message: 'At least one field (email or name) must be provided for update' }
);

// User entity complete schema (for validation after creation)
export const UserSchema = z.object({
  id: UserIdSchema,
  email: UserEmailSchema,
  name: UserNameSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
  deletedAt: z.date().nullable(),
});

// Export types
export type CreateUserInput = z.infer<typeof CreateUserSchema>;
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;
export type UserValidated = z.infer<typeof UserSchema>;

// Validation helper functions
export class UserValidation {
  static validateEmail(email: string): { success: boolean; data?: string; error?: string } {
    const result = UserEmailSchema.safeParse(email);
    if (result.success) {
      return { success: true, data: result.data };
    }
    return { success: false, error: result.error.issues[0]?.message || 'Invalid email' };
  }

  static validateName(name: string): { success: boolean; data?: string; error?: string } {
    const result = UserNameSchema.safeParse(name);
    if (result.success) {
      return { success: true, data: result.data };
    }
    return { success: false, error: result.error.issues[0]?.message || 'Invalid name' };
  }

  static validateCreateUser(data: unknown): { success: boolean; data?: CreateUserInput; error?: string } {
    const result = CreateUserSchema.safeParse(data);
    if (result.success) {
      return { success: true, data: result.data };
    }
    return { 
      success: false, 
      error: result.error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
    };
  }

  static validateUpdateUser(data: unknown): { success: boolean; data?: UpdateUserInput; error?: string } {
    const result = UpdateUserSchema.safeParse(data);
    if (result.success) {
      return { success: true, data: result.data };
    }
    return { 
      success: false, 
      error: result.error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
    };
  }
}