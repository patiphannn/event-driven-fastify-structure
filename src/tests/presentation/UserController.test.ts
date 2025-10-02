import { FastifyRequest, FastifyReply } from 'fastify';
import { UserController } from '../../presentation/controllers/UserController';
import { ValidationError, NotFoundError, ConflictError } from '../../shared/errors/ErrorTypes';

describe('UserController', () => {
  let userController: UserController;
  let mockCreateUserUseCase: any;
  let mockUpdateUserUseCase: any;
  let mockDeleteUserUseCase: any;
  let mockListUsersUseCase: any;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock use cases
    mockCreateUserUseCase = {
      execute: jest.fn()
    };

    mockUpdateUserUseCase = {
      execute: jest.fn()
    };

    mockDeleteUserUseCase = {
      execute: jest.fn()
    };

    mockListUsersUseCase = {
      execute: jest.fn()
    };

    userController = new UserController(
      mockCreateUserUseCase,
      mockUpdateUserUseCase,
      mockDeleteUserUseCase,
      mockListUsersUseCase
    );

    mockRequest = {
      params: {},
      body: {},
      query: {},
      method: 'GET',
      url: '/api/users',
      headers: { 'user-agent': 'test-agent' },
      ip: '127.0.0.1',
      user: { id: '456', email: 'test@example.com', name: 'Test User' }
    };

    mockReply = {
      code: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      header: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis()
    };
  });

  describe('listUsers', () => {
    it('should list users with default pagination', async () => {
      const mockUsers = [
        { id: '1', name: 'User 1', email: 'user1@example.com' },
        { id: '2', name: 'User 2', email: 'user2@example.com' }
      ];

      const mockResult = {
        users: mockUsers,
        pagination: {
          page: 1,
          limit: 10,
          total: 2,
          totalPages: 1
        }
      };

      mockListUsersUseCase.execute.mockResolvedValue(mockResult);

      await userController.listUsers(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockListUsersUseCase.execute).toHaveBeenCalledWith({
        page: 1,
        limit: 10
      });
      expect(mockReply.code).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: mockResult,
        message: 'Users listed successfully'
      });
    });

    it('should list users with custom pagination', async () => {
      mockRequest.query = { page: '2', limit: '5' };

      const mockResult = {
        users: [],
        pagination: {
          page: 2,
          limit: 5,
          total: 0,
          totalPages: 0
        }
      };

      mockListUsersUseCase.execute.mockResolvedValue(mockResult);

      await userController.listUsers(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockListUsersUseCase.execute).toHaveBeenCalledWith({
        page: 2,
        limit: 5
      });
      expect(mockReply.code).toHaveBeenCalledWith(200);
    });
  });

  describe('createUser', () => {
    it('should create user successfully', async () => {
      const createData = {
        name: 'New User',
        email: 'newuser@example.com'
      };

      const mockCreatedUser = {
        id: '123',
        ...createData,
        created_at: new Date()
      };

      mockRequest.body = createData;
      mockCreateUserUseCase.execute.mockResolvedValue(mockCreatedUser);

      await userController.createUser(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockCreateUserUseCase.execute).toHaveBeenCalledWith(createData);
      expect(mockReply.code).toHaveBeenCalledWith(202); // Async operation
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: mockCreatedUser,
        message: 'User creation initiated successfully'
      });
    });

    it('should handle validation errors during creation', async () => {
      const invalidData = {
        name: '',
        email: 'invalid-email'
      };

      mockRequest.body = invalidData;
      mockCreateUserUseCase.execute.mockRejectedValue(
        new ValidationError('Invalid user data', { field: 'email' })
      );

      await expect(
        userController.createUser(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow(ValidationError);
    });

    it('should handle conflict errors during creation', async () => {
      const userData = {
        name: 'Test User',
        email: 'existing@example.com'
      };

      mockRequest.body = userData;
      mockCreateUserUseCase.execute.mockRejectedValue(
        new ConflictError('User already exists')
      );

      await expect(
        userController.createUser(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('updateUser', () => {
    it('should update user successfully', async () => {
      const userId = '123';
      const updateData = {
        name: 'Updated User',
        email: 'updated@example.com'
      };

      const mockUpdatedUser = {
        id: userId,
        ...updateData,
        updated_at: new Date()
      };

      mockRequest.params = { id: userId };
      mockRequest.body = updateData;
      mockUpdateUserUseCase.execute.mockResolvedValue(mockUpdatedUser);

      await userController.updateUser(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockUpdateUserUseCase.execute).toHaveBeenCalledWith({
        id: userId,
        ...updateData
      });
      expect(mockReply.code).toHaveBeenCalledWith(202); // Async operation
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: mockUpdatedUser,
        message: 'User update initiated successfully'
      });
    });

    it('should handle not found errors during update', async () => {
      const userId = 'nonexistent';
      const updateData = { name: 'Updated Name' };

      mockRequest.params = { id: userId };
      mockRequest.body = updateData;
      mockUpdateUserUseCase.execute.mockRejectedValue(
        new NotFoundError('User not found')
      );

      await expect(
        userController.updateUser(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('deleteUser', () => {
    it('should delete user successfully', async () => {
      const userId = '123';

      mockRequest.params = { id: userId };
      mockDeleteUserUseCase.execute.mockResolvedValue(undefined);

      await userController.deleteUser(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockDeleteUserUseCase.execute).toHaveBeenCalledWith({
        id: userId
      });
      expect(mockReply.code).toHaveBeenCalledWith(202); // Async operation
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        message: 'User deletion initiated successfully'
      });
    });

    it('should handle not found errors during deletion', async () => {
      const userId = 'nonexistent';

      mockRequest.params = { id: userId };
      mockDeleteUserUseCase.execute.mockRejectedValue(
        new NotFoundError('User not found')
      );

      await expect(
        userController.deleteUser(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('validatePagination', () => {
    it('should validate and return correct pagination values', () => {
      const result = (userController as any).validatePagination(2, 15, 50);
      
      expect(result).toEqual({
        page: 2,
        limit: 15
      });
    });

    it('should handle invalid page numbers', () => {
      const result = (userController as any).validatePagination(-1, 10, 50);
      
      expect(result.page).toBe(1); // Should default to 1
    });

    it('should handle limit exceeding maximum', () => {
      const result = (userController as any).validatePagination(1, 100, 50);
      
      expect(result.limit).toBe(50); // Should cap at max limit
    });

    it('should handle invalid limit values', () => {
      const result = (userController as any).validatePagination(1, 0, 50);
      
      expect(result.limit).toBe(10); // Should default to reasonable value
    });
  });
});