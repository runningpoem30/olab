import type { EmailPage, ScheduleRequest, ScheduleResponse, Sender, SlackConnection, User } from '../types/api';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';
let csrfToken: string | null = null;

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...options.headers },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(payload.error ?? `Request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function getCurrentUser(): Promise<User> {
  const user = await request<User>('/auth/me');
  csrfToken = user.csrfToken;
  return user;
}

export async function getCsrfToken(): Promise<string> {
  if (csrfToken) return csrfToken;
  const result = await request<{ token: string }>('/auth/csrf');
  csrfToken = result.token;
  return csrfToken;
}

export async function getSlackConnection(): Promise<SlackConnection> {
  return request<SlackConnection>('/auth/slack/connection');
}

export async function disconnectSlack(): Promise<void> {
  const token = await getCsrfToken();
  await request<void>('/auth/slack/connection', { method: 'DELETE', headers: { 'x-csrf-token': token } });
}

export async function getSenders(): Promise<Sender[]> {
  const result = await request<{ data: Sender[] }>('/api/emails/senders');
  return result.data;
}

export async function getEmails(status: 'scheduled' | 'sent', query = ''): Promise<EmailPage> {
  if (query.trim().length >= 2) {
    const result = await request<{ total: number; data: Array<EmailRecordSearch> }>(`/api/emails/search?q=${encodeURIComponent(query.trim())}`);
    const data = result.data.filter((email) => status === 'scheduled'
      ? email.status === 'SCHEDULED' || email.status === 'SENDING'
      : email.status === 'SENT' || email.status === 'FAILED');
    return { data: data as EmailPage['data'], nextCursor: null, total: result.total };
  }
  return request<EmailPage>(`/api/emails?status=${status}&limit=100`);
}

interface EmailRecordSearch {
  id: string;
  userId: string;
  senderId: string;
  sender: string;
  recipient: string;
  subject: string;
  body: string;
  status: 'SCHEDULED' | 'SENDING' | 'SENT' | 'FAILED';
  scheduledAt: string;
  sentAt: string | null;
  failedAt?: string | null;
  failureReason?: string | null;
  createdAt?: string;
}

export async function scheduleEmails(payload: ScheduleRequest): Promise<ScheduleResponse> {
  const token = await getCsrfToken();
  return request<ScheduleResponse>('/api/emails', {
    method: 'POST',
    headers: { 'x-csrf-token': token },
    body: JSON.stringify(payload),
  });
}

export async function logout(): Promise<void> {
  const token = await getCsrfToken();
  await request<void>('/auth/logout', { method: 'POST', headers: { 'x-csrf-token': token } });
  csrfToken = null;
}
