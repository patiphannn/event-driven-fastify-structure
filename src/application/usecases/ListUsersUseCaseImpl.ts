import { UserRepository } from '../../domain/repositories/UserRepository';
import { ListUsersRequest, ListUsersResponse } from '../../shared/types';
import { CacheService } from '../../infrastructure/cache/CacheService';
import { trace } from '@opentelemetry/api';

export interface ListUsersUseCase {
  execute(request: ListUsersRequest): Promise<ListUsersResponse>;
}

export class ListUsersUseCaseImpl implements ListUsersUseCase {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly cacheService: CacheService
  ) {}

  async execute(request: ListUsersRequest): Promise<ListUsersResponse> {
    const tracer = trace.getTracer('user-service');
    const span = tracer.startSpan('ListUsersUseCase.execute');

    try {
      const page = request.page || 1;
      const limit = Math.min(request.limit || 10, 100); // Max 100 items per page

      span.setAttributes({
        'users.list.page': page,
        'users.list.limit': limit,
      });

      // Check cache first
      const cacheKey = this.cacheService.generateUserListKey(page, limit);
      const cached = await this.cacheService.get<ListUsersResponse>(cacheKey);

      if (cached) {
        span.setAttributes({
          'users.list.cache_hit': true,
          'users.list.total': cached.pagination.total,
        });
        return cached;
      }

      // Fetch from database
      const { users, total } = await this.userRepository.findMany(page, limit);
      const totalPages = Math.ceil(total / limit);

      const response: ListUsersResponse = {
        users: users.map(user => ({
          id: user.id,
          email: user.email,
          name: user.name,
          createdAt: user.createdAt.toISOString(),
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      };

      // Cache the result
      await this.cacheService.set(cacheKey, response, 300); // Cache for 5 minutes

      span.setAttributes({
        'users.list.cache_hit': false,
        'users.list.total': total,
        'users.list.total_pages': totalPages,
      });

      return response;
    } catch (error) {
      span.recordException(error as Error);
      span.setAttributes({
        'operation.success': false,
        'error.name': (error as Error).name,
        'error.message': (error as Error).message,
      });
      throw error;
    } finally {
      span.end();
    }
  }
}
