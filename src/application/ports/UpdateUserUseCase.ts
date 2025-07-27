import { UpdateUserRequest, UpdateUserResponse } from '../../shared/types';

export interface UpdateUserUseCase {
  execute(request: UpdateUserRequest): Promise<UpdateUserResponse>;
}
