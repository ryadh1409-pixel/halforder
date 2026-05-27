export type DriverQueryLogPayload = {
  listener: string;
  collection: string;
  filters: Record<string, unknown>;
  file?: string;
};

export {
  beginFirestoreQuery,
  isFirestorePermissionDenied,
  logDriverQueryStart,
  logDriverQueryError,
  logFirestoreQueryFailed,
} from './firestoreQueryDiagnostics';
