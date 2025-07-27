import { DeleteUserRequest, DeleteUserResponse } from '../../shared/types';

export interface DeleteUserUseCase {
  execute(request: DeleteUserRequest): Promise<DeleteUserResponse>;
}
