import { PrismaUnitOfWork } from '../../infrastructure/database/PrismaUnitOfWork';
import { DatabaseClient } from '../../infrastructure/database/DatabaseClient';

// Mock DatabaseClient
jest.mock('../../infrastructure/database/DatabaseClient');

describe('PrismaUnitOfWork', () => {
  let unitOfWork: PrismaUnitOfWork;
  let mockPrisma: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockPrisma = {
      $transaction: jest.fn()
    };

    (DatabaseClient.getInstance as jest.Mock).mockReturnValue(mockPrisma);
    unitOfWork = new PrismaUnitOfWork();
  });

  describe('execute', () => {
    it('should execute function within transaction', async () => {
      const testFunction = jest.fn().mockResolvedValue('test result');
      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        return await fn();
      });

      const result = await unitOfWork.execute(testFunction);

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(testFunction).toHaveBeenCalledTimes(1);
      expect(result).toBe('test result');
    });

    it('should handle transaction failure', async () => {
      const testFunction = jest.fn().mockRejectedValue(new Error('Transaction failed'));
      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        return await fn();
      });

      await expect(unitOfWork.execute(testFunction)).rejects.toThrow('Transaction failed');
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('should handle complex return types', async () => {
      const complexResult = {
        users: [{ id: '1', name: 'Test' }],
        count: 5,
        metadata: { total: 10 }
      };
      
      const testFunction = jest.fn().mockResolvedValue(complexResult);
      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        return await fn();
      });

      const result = await unitOfWork.execute(testFunction);

      expect(result).toEqual(complexResult);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('should handle async function execution', async () => {
      const asyncFunction = jest.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'async result';
      });
      
      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        return await fn();
      });

      const result = await unitOfWork.execute(asyncFunction);

      expect(result).toBe('async result');
      expect(asyncFunction).toHaveBeenCalledTimes(1);
    });

    it('should propagate transaction rollback on function error', async () => {
      const errorFunction = jest.fn().mockRejectedValue(new Error('Business logic error'));
      mockPrisma.$transaction.mockRejectedValue(new Error('Transaction rolled back'));

      await expect(unitOfWork.execute(errorFunction)).rejects.toThrow('Transaction rolled back');
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });
});