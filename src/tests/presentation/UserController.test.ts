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
          totalPages: 1,
          hasNext: false,
          hasPrev: false
        }
      };

      mockListUsersUseCase.execute.mockResolvedValue(mockResult);

      await userController.listUsers(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockListUsersUseCase.execute).toHaveBeenCalledWith({
        page: 1,
        limit: 10
      });
      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        data: mockResult.users,
        meta: expect.objectContaining({
          pagination: mockResult.pagination
        })
      }));
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
      expect(mockReply.status).toHaveBeenCalledWith(200);
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

      expect(mockCreateUserUseCase.execute).toHaveBeenCalledWith({
        ...createData,
        createdBy: mockRequest.user
      });
      expect(mockReply.status).toHaveBeenCalledWith(202); // Async operation
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        data: mockCreatedUser,
        meta: expect.objectContaining({
          message: expect.stringContaining('User creation initiated')
        })
      }));
    });

    it('should handle validation errors during creation', async () => {
      const invalidData = {
        email: 'test@example.com'
        // missing name field
      };

      mockRequest.body = invalidData;

      await userController.createUser(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // The controller should handle validation error and send error response
      expect(mockReply.status).toHaveBeenCalledWith(400);
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

      await userController.createUser(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // The controller should handle conflict error and send error response
      expect(mockReply.status).toHaveBeenCalledWith(409);
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
        updated_at: new Date(),
        version: 2
      };

      mockRequest.params = { id: userId };
      mockRequest.body = updateData;
      mockUpdateUserUseCase.execute.mockResolvedValue(mockUpdatedUser);

      await userController.updateUser(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockUpdateUserUseCase.execute).toHaveBeenCalledWith({
        id: userId,
        ...updateData,
        updatedBy: mockRequest.user
      });
      expect(mockReply.status).toHaveBeenCalledWith(200); // Success response
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        data: mockUpdatedUser,
        meta: expect.objectContaining({
          version: '2'
        })
      }));
    });

    it('should handle not found errors during update', async () => {
      const userId = 'nonexistent';
      const updateData = { name: 'Updated Name' };

      mockRequest.params = { id: userId };
      mockRequest.body = updateData;
      mockUpdateUserUseCase.execute.mockRejectedValue(
        new NotFoundError('User not found')
      );

      await userController.updateUser(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // The controller should handle not found error and send error response
      expect(mockReply.status).toHaveBeenCalledWith(404);
    });
  });

  describe('deleteUser', () => {
    it('should delete user successfully', async () => {
      const userId = '123';

      mockRequest.params = { id: userId };
      const mockDeletedUser = {
        id: userId,
        version: 3
      };
      mockDeleteUserUseCase.execute.mockResolvedValue(mockDeletedUser);

      await userController.deleteUser(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockDeleteUserUseCase.execute).toHaveBeenCalledWith({
        id: userId,
        deletedBy: mockRequest.user
      });
      expect(mockReply.status).toHaveBeenCalledWith(200); // Success response
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        data: mockDeletedUser,
        meta: expect.objectContaining({
          version: '3'
        })
      }));
    });

    it('should handle not found errors during deletion', async () => {
      const userId = 'nonexistent';

      mockRequest.params = { id: userId };
      mockDeleteUserUseCase.execute.mockRejectedValue(
        new NotFoundError('User not found')
      );

      await userController.deleteUser(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // The controller should handle not found error and send error response
      expect(mockReply.status).toHaveBeenCalledWith(404);
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
      expect(() => {
        (userController as any).validatePagination(-1, 10, 50);
      }).toThrow('Page must be >= 1');
    });

    it('should handle limit exceeding maximum', () => {
      expect(() => {
        (userController as any).validatePagination(1, 100, 50);
      }).toThrow('Limit must be <= 50');
    });

    it('should handle invalid limit values', () => {
      expect(() => {
        (userController as any).validatePagination(1, 0, 50);
      }).toThrow('Limit must be >= 1');
    });
  });
});