/** Tipos de la API /api/v1 (ver backend/src/routes/v1). */

export type Role = 'DIRECTOR' | 'SOSTENEDOR' | 'EQUIPO_DIRECTIVO' | 'DOCENTE' | 'APODERADO';
export type DocumentStatus = 'VIGENTE' | 'ARCHIVADO';

export interface User {
  id: number;
  username: string;
  fullName: string;
  email: string;
  rut: string;
  role: Role;
  phone: string | null;
  isActive: boolean;
  mfaEnabled: boolean;
}

export interface Pupil {
  id: number;
  fullName: string;
  course: { id: number; name: string } | string;
}

export interface Me extends User {
  mfaAvailable: boolean;
  pupils: { id: number; fullName: string; course: { id: number; name: string } }[];
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: User;
}

export type LoginResponse = ({ mfaRequired: false } & Session) | { mfaRequired: true; mfaToken: string };

export interface DocumentType {
  id: number;
  code: string;
  name: string;
  color: string;
}

export interface DocumentFile {
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
}

export interface DocumentItem {
  id: number;
  title: string;
  description: string | null;
  documentType: DocumentType;
  folioNumber: string;
  documentDate: string;
  author: { id: number; fullName: string; role: Role };
  file: DocumentFile | null;
  status: DocumentStatus;
  requiresAcknowledgement: boolean;
  visibility: Role[];
  recipientIds: number[];
  courseIds: number[];
  createdAt: string;
  updatedAt: string;
  myAcknowledgedAt?: string | null;
}

export interface DocumentDetail extends DocumentItem {
  myAcknowledgedAt: string | null;
  canAcknowledge: boolean;
  permissions: { edit: boolean; archive: boolean; delete: boolean; viewTracking: boolean };
}

export interface Paginated<T> {
  total: number;
  page: number;
  pageSize: number;
  items: T[];
}

export interface DocumentFilters {
  q?: string;
  type?: string;
  from?: string;
  to?: string;
  authorId?: number;
  status?: DocumentStatus;
  scope?: 'all' | 'mine';
}

export interface SignedUrl {
  url: string;
  expiresIn: number;
  fileName: string | null;
  mimeType: string | null;
}

export interface AcknowledgementMember {
  userId: number;
  fullName: string;
  role: Role;
  acknowledgedAt: string | null;
}

export interface AcknowledgementSummary {
  requiresAcknowledgement: boolean;
  total: number;
  acknowledged: number;
  pending: number;
  members: AcknowledgementMember[];
}

export interface DownloadEntry {
  id: number;
  user: { id: number; fullName: string; role: Role };
  downloadedAt: string;
  ipAddress: string | null;
}

export interface ActivityEntry {
  id: number;
  action: string;
  entity: string;
  entityId: string | null;
  user: { id: number; fullName: string; role: Role } | null;
  createdAt: string;
}

export interface GlobalDashboard {
  scope: 'global';
  kpis: { totalDocuments: number; uploadedThisMonth: number; downloadsThisMonth: number; pendingAcknowledgements: number };
  byType: { code: string; name: string; color: string; count: number }[];
  byMonth: { month: string; label: string; count: number }[];
  latestDocuments: DocumentItem[];
  recentActivity: ActivityEntry[];
}

export interface PersonalDashboard {
  scope: 'personal';
  kpis: { totalVisible: number; directedToMe: number; pendingAcknowledgements: number };
  recentDocuments: DocumentItem[];
  directedToMe: DocumentItem[];
  pendingAcknowledgements: DocumentItem[];
  pupils: { id: number; fullName: string; course: string }[];
}

export type Dashboard = GlobalDashboard | PersonalDashboard;

export interface Course {
  id: number;
  name: string;
  year: number;
  studentCount: number;
}

export interface CourseDetail {
  id: number;
  name: string;
  year: number;
  students: {
    id: number;
    fullName: string;
    rut: string;
    guardians: { id: number; fullName: string; email: string; phone: string | null }[];
  }[];
}

export interface Student {
  id: number;
  fullName: string;
  rut: string;
  course: { id: number; name: string; year: number };
  guardians: { id: number; fullName: string }[];
}

export interface AuditLogEntry {
  id: number;
  userId: number | null;
  action: string;
  entity: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  user: { id: number; fullName: string; role: Role } | null;
}

export interface DownloadLogEntry {
  id: number;
  downloadedAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  user: { id: number; fullName: string; role: Role };
  document: { id: number; title: string; folioNumber: string };
}

export interface MfaSetup {
  secret: string;
  otpauthUrl: string;
  qrDataUrl: string;
}
