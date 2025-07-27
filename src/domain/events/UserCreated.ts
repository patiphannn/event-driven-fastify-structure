import { UserCreatedEvent } from '../../shared/types';

export class UserCreated {
  constructor(
    public readonly userId: string,
    public readonly email: string,
    public readonly name: string,
    public readonly createdAt: Date
  ) {}

  toEventData(): UserCreatedEvent {
    return {
      userId: this.userId,
      email: this.email,
      name: this.name,
      createdAt: this.createdAt.toISOString(),
    };
  }
}
