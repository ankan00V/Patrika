export type EmailStatus = "scheduled" | "sending" | "sent" | "failed";
export type EmailTab = "scheduled" | "sent";

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

export type SlackStatus =
  | { connected: true; teamName: string; channel: string }
  | { connected: false };

export interface MeResponse {
  user: User;
  slack: SlackStatus;
}

export interface EmailListItem {
  id: string;
  campaignId: string;
  recipient: string;
  subject: string;
  /** First ~180 characters of the plain-text body. */
  preview: string;
  status: EmailStatus;
  starred: boolean;
  scheduledAt: string;
  sentAt: string | null;
  failedAt: string | null;
  deferrals: number;
  attempts: number;
  error: string | null;
  previewUrl: string | null;
  senderEmail: string;
  senderName: string;
}

export interface AttachmentMeta {
  id: string;
  filename: string;
  contentType: string;
  size: number;
}

export interface EmailDetail extends EmailListItem {
  /** Sanitized HTML. */
  body: string;
  messageId: string | null;
  attachments: AttachmentMeta[];
}

export interface EmailFilter {
  status?: EmailStatus;
  starred?: boolean;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  searchEngine?: "elasticsearch" | "postgres";
}

export interface EmailStats {
  scheduled: number;
  sent: number;
  failed: number;
}

export interface Sender {
  id: string;
  name: string;
  email: string;
  sentThisHour: number;
}

export interface SendersResponse {
  hourlyLimitPerSender: number;
  minDelayBetweenSendsMs: number;
  senders: Sender[];
}

export interface CreateCampaignRequest {
  idempotencyKey: string;
  subject: string;
  body: string;
  recipients: string[];
  startAt: string;
  delayBetweenSeconds: number;
  hourlyLimit: number;
  senderId?: string;
  attachments: { filename: string; contentType: string; contentBase64: string }[];
}

export interface Campaign {
  id: string;
  subject: string;
  startAt: string;
  delayBetweenMs: number;
  hourlyLimit: number;
  totalEmails: number;
}

export interface CreateCampaignResponse {
  campaign: Campaign;
  duplicate: boolean;
  summary?: {
    scheduled: number;
    duplicatesRemoved: number;
    deferredByHourlyLimit: number;
    firstSendAt: string;
    lastSendAt: string;
  };
}

export interface ApiErrorBody {
  error: string;
  details?: { path: string; message: string }[];
}
