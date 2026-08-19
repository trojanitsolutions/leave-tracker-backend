export interface Notification {
  id: number;
  employeeId: number;
  action: string;
  message: string;
  leaveRequestId: number | null;
  extensionId: number | null;
  isRead: boolean;
  createdAt: string;
}

export interface CreateNotificationInput {
  employeeId: number;
  action: string;
  message: string;
  leaveRequestId?: number | null;
  extensionId?: number | null;
}

export interface INotificationRepository {
  findByEmployeeId(employeeId: number, limit?: number): Promise<Notification[]>;
  countUnread(employeeId: number): Promise<number>;
  create(data: CreateNotificationInput): Promise<Notification>;
  markRead(id: number, employeeId: number): Promise<Notification | null>;
  markAllRead(employeeId: number): Promise<void>;
  delete(id: number, employeeId: number): Promise<void>;
}
