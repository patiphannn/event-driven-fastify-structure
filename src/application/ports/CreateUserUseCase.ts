import { CreateUserRequest, CreateUserResponse } from '../../shared/types';

export interface CreateUserUseCase {
  execute(request: CreateUserRequest): Promise<CreateUserResponse>;
}
