import type { WorkspaceState } from './types';

const DB_NAME = 'transcript-workbench';
const STORE_NAME = 'workspace';
const RECORD_KEY = 'state-v2';
const FALLBACK_KEY = 'transcript-workbench-state-v2';

export async function loadWorkspace(): Promise<WorkspaceState | null> {
  try {
    const db = await openDatabase();
    const result = await new Promise<WorkspaceState | undefined>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).get(RECORD_KEY);
      request.onsuccess = () => resolve(request.result as WorkspaceState | undefined);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return result ?? loadFallback();
  } catch {
    return loadFallback();
  }
}

export async function saveWorkspace(state: WorkspaceState): Promise<void> {
  // Merged documents are generated views. Persisting them duplicates every source
  // segment and can make IndexedDB structured-cloning very expensive for large sets.
  const persisted = persistentState(state);
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(persisted, RECORD_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  } catch {
    try {
      localStorage.setItem(FALLBACK_KEY, JSON.stringify(persisted));
    } catch {
      // Persistence is best-effort. The current in-memory workspace still works.
    }
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function loadFallback(): WorkspaceState | null {
  try {
    const raw = localStorage.getItem(FALLBACK_KEY);
    return raw ? (JSON.parse(raw) as WorkspaceState) : null;
  } catch {
    return null;
  }
}


function persistentState(state: WorkspaceState): WorkspaceState {
  const projects = state.projects.map((project) => ({
    ...project,
    documents: project.documents.filter((document) => document.kind === 'source'),
  }));
  const activeProject = projects.find((project) => project.id === state.activeProjectId);
  const activeDocumentId = activeProject?.documents.some((document) => document.id === state.activeDocumentId)
    ? state.activeDocumentId
    : activeProject?.documents[0]?.id ?? null;
  return { ...state, projects, activeDocumentId };
}
