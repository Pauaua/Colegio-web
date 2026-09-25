import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api } from './client';
import type {
  AcknowledgementSummary,
  AuditLogEntry,
  Course,
  CourseDetail,
  Dashboard,
  DocumentDetail,
  DocumentFilters,
  DocumentItem,
  DocumentType,
  DownloadEntry,
  DownloadLogEntry,
  Me,
  Paginated,
  Role,
  Student,
  User,
} from './types';

const PAGE_SIZE = 20;

/** Quita filtros vacíos para no enviarlos en la query string. */
function clean<T extends object>(params: T): Partial<T> {
  return Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== null)) as Partial<T>;
}

export const queryKeys = {
  me: ['me'] as const,
  dashboard: ['dashboard'] as const,
  documentTypes: ['document-types'] as const,
  documents: (filters: DocumentFilters) => ['documents', filters] as const,
  documentsAll: ['documents'] as const,
  document: (id: number) => ['document', id] as const,
  documentDownloads: (id: number) => ['document', id, 'downloads'] as const,
  documentAcks: (id: number) => ['document', id, 'acks'] as const,
  users: (params: object) => ['users', params] as const,
  usersAll: ['users'] as const,
  courses: ['courses'] as const,
  course: (id: number) => ['course', id] as const,
  students: ['students'] as const,
  auditLogs: (params: object) => ['audit-logs', params] as const,
  downloadLogs: (params: object) => ['download-logs', params] as const,
  auditActions: ['audit-actions'] as const,
};

export const useMe = () =>
  useQuery({ queryKey: queryKeys.me, queryFn: async () => (await api.get<Me>('/auth/me')).data });

export const useDashboard = () =>
  useQuery({ queryKey: queryKeys.dashboard, queryFn: async () => (await api.get<Dashboard>('/dashboard/summary')).data });

export const useDocumentTypes = () =>
  useQuery({
    queryKey: queryKeys.documentTypes,
    queryFn: async () => (await api.get<DocumentType[]>('/document-types')).data,
    staleTime: 60 * 60 * 1000,
  });

export const useDocuments = (filters: DocumentFilters) =>
  useInfiniteQuery({
    queryKey: queryKeys.documents(filters),
    initialPageParam: 1,
    queryFn: async ({ pageParam }) =>
      (await api.get<Paginated<DocumentItem>>('/documents', { params: clean({ ...filters, page: pageParam, pageSize: PAGE_SIZE }) })).data,
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
  });

export const useDocument = (id: number) =>
  useQuery({
    queryKey: queryKeys.document(id),
    queryFn: async () => (await api.get<DocumentDetail>(`/documents/${id}`)).data,
    enabled: Number.isFinite(id),
    retry: (count, error) => count < 2 && ![403, 404].includes((error as { response?: { status?: number } }).response?.status ?? 0),
  });

export const useDocumentDownloads = (id: number, enabled: boolean) =>
  useQuery({
    queryKey: queryKeys.documentDownloads(id),
    queryFn: async () => (await api.get<DownloadEntry[]>(`/documents/${id}/downloads`)).data,
    enabled,
  });

export const useDocumentAcknowledgements = (id: number, enabled: boolean) =>
  useQuery({
    queryKey: queryKeys.documentAcks(id),
    queryFn: async () => (await api.get<AcknowledgementSummary>(`/documents/${id}/acknowledgements`)).data,
    enabled,
  });

export const useUsers = (params: { role?: Role; q?: string; isActive?: boolean } = {}, enabled = true) =>
  useQuery({
    queryKey: queryKeys.users(params),
    queryFn: async () => (await api.get<Paginated<User>>('/users', { params: clean({ ...params, pageSize: 200 }) })).data.items,
    enabled,
  });

export const useCourses = (enabled = true) =>
  useQuery({ queryKey: queryKeys.courses, queryFn: async () => (await api.get<Course[]>('/courses')).data, enabled });

export const useCourse = (id: number | null) =>
  useQuery({
    queryKey: queryKeys.course(id ?? 0),
    queryFn: async () => (await api.get<CourseDetail>(`/courses/${id}`)).data,
    enabled: id !== null,
  });

export const useStudents = (enabled = true) =>
  useQuery({ queryKey: queryKeys.students, queryFn: async () => (await api.get<Student[]>('/students')).data, enabled });

export interface AuditFilters {
  action?: string;
  from?: string;
  to?: string;
}

export const useAuditLogs = (filters: AuditFilters) =>
  useInfiniteQuery({
    queryKey: queryKeys.auditLogs(filters),
    initialPageParam: 1,
    queryFn: async ({ pageParam }) =>
      (await api.get<Paginated<AuditLogEntry>>('/audit-logs', { params: clean({ ...filters, page: pageParam, pageSize: 30 }) })).data,
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
  });

export const useDownloadLogs = (filters: Omit<AuditFilters, 'action'>) =>
  useInfiniteQuery({
    queryKey: queryKeys.downloadLogs(filters),
    initialPageParam: 1,
    queryFn: async ({ pageParam }) =>
      (await api.get<Paginated<DownloadLogEntry>>('/audit-logs/downloads', { params: clean({ ...filters, page: pageParam, pageSize: 30 }) }))
        .data,
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
  });

export const useAuditActions = () =>
  useQuery({ queryKey: queryKeys.auditActions, queryFn: async () => (await api.get<string[]>('/audit-logs/actions')).data });
