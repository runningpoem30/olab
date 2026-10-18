export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  csrfToken: string;
  defaultSender: string | null;
}

export interface SlackConnection {
  connected: boolean;
  teamId: string | null;
  teamName: string | null;
}

export type EmailStatus = 'SCHEDULED' | 'SENDING' | 'SENT' | 'FAILED';

export interface EmailRecord {
  id: string;
  userId: string;
  senderId: string;
  recipient: string;
  sender: string;
  subject: string;
  body: string;
  scheduledAt: string;
  sentAt: string | null;
  failedAt: string | null;
  failureReason: string | null;
  status: EmailStatus;
  createdAt: string;
}

export interface EmailPage {
  data: EmailRecord[];
  nextCursor: string | null;
  total: number;
}

export interface ScheduleRequest {
  sender: string;
  subject: string;
  body: string;
  recipients: string[];
  startAt: string;
  delayBetweenEmailsMs: number;
  hourlyLimit?: number;
  idempotencyKey: string;
}

export interface ScheduleResponse {
  accepted: number;
  duplicate: boolean;
  emailIds: string[];
}

export interface Sender {
  id: string;
  address: string;
  label: string | null;
}
