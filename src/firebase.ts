import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { PillarWeightsConfig, ValuationAssumptions } from './engine/types.ts';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Verifique a configuração do Firebase.');
    }
    return false;
  }
}

void testConnection();

export type OrgRole = 'admin' | 'analyst' | 'viewer';

export interface OrganizationRecord {
  id: string;
  name: string;
  cnpj?: string;
  ownerId: string;
  planTier: 'institutional' | 'pro' | 'trial';
  role: OrgRole;
}

export interface WorkspaceAnalysisRecord {
  ticker: string;
  orgId: string;
  updatedBy: string;
  status: 'rascunho' | 'revisado' | 'aprovado';
  analystNotes: string;
  valuationOverrides?: Partial<ValuationAssumptions>;
  customAssetData?: Record<string, unknown>;
}

export interface FirestoreAuditEntry {
  id: string;
  orgId: string;
  userId: string;
  userDisplayName: string;
  action: string;
  targetTicker?: string;
  details: string;
  createdAt?: unknown;
}

export function subscribeAuth(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

export async function loginWithGoogle() {
  return signInWithPopup(auth, googleProvider);
}

export async function logoutUser() {
  return signOut(auth);
}

function makeOrgIdFromUid(uid: string) {
  const clean = uid.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24);
  return `org_${clean || 'default'}`;
}

export async function bootstrapUserAndOrgs(user: User): Promise<OrganizationRecord[]> {
  if (!user.emailVerified) {
    throw new Error('E-mail verificado obrigatório para acesso institucional.');
  }
  const userPath = `users/${user.uid}`;
  const privatePath = `users/${user.uid}/private/info`;
  const membershipsPath = `users/${user.uid}/memberships`;
  const displayName = user.displayName || user.email?.split('@')[0] || 'Analista';

  // Ensure public + private PII profile documents
  try {
    const existingPublic = await getDoc(doc(db, 'users', user.uid));
    if (!existingPublic.exists()) {
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        displayName: displayName.slice(0, 120),
        ...(user.photoURL ? { photoURL: user.photoURL.slice(0, 512) } : {}),
        defaultOrgId: makeOrgIdFromUid(user.uid),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(
        doc(db, 'users', user.uid),
        {
          displayName: displayName.slice(0, 120),
          ...(user.photoURL ? { photoURL: user.photoURL.slice(0, 512) } : {}),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, userPath);
  }

  try {
    await setDoc(
      doc(db, 'users', user.uid, 'private', 'info'),
      {
        uid: user.uid,
        email: (user.email || 'no-email@local.invalid').slice(0, 200),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, privatePath);
  }

  // Load memberships or atomically create default tenant workspace
  let membershipsSnap;
  try {
    membershipsSnap = await getDocs(collection(db, 'users', user.uid, 'memberships'));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, membershipsPath);
  }

  if (membershipsSnap.empty) {
    const orgId = makeOrgIdFromUid(user.uid);
    const orgName = `Escritório ${displayName.split(' ')[0]}`.slice(0, 120);
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'organizations', orgId), {
        id: orgId,
        name: orgName,
        ownerId: user.uid,
        planTier: 'institutional',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(db, 'organizations', orgId, 'members', user.uid), {
        uid: user.uid,
        orgId,
        role: 'admin',
        displayName: displayName.slice(0, 120),
        addedBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(db, 'users', user.uid, 'memberships', orgId), {
        orgId,
        orgName,
        role: 'admin',
        createdAt: serverTimestamp(),
      });
      await batch.commit();
      return [
        {
          id: orgId,
          name: orgName,
          ownerId: user.uid,
          planTier: 'institutional',
          role: 'admin',
        },
      ];
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `organizations/${orgId}`);
    }
  }

  const orgs: OrganizationRecord[] = [];
  for (const mDoc of membershipsSnap.docs) {
    const mData = mDoc.data() as { orgId: string; orgName: string; role: OrgRole };
    try {
      const orgDoc = await getDoc(doc(db, 'organizations', mData.orgId));
      if (orgDoc.exists()) {
        const od = orgDoc.data() as {
          id: string;
          name: string;
          cnpj?: string;
          ownerId: string;
          planTier: 'institutional' | 'pro' | 'trial';
        };
        orgs.push({ ...od, role: mData.role });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `organizations/${mData.orgId}`);
    }
  }
  return orgs;
}

export async function createNewOrganization(
  user: User,
  name: string,
  cnpj?: string
): Promise<OrganizationRecord> {
  const orgId = `org_${Date.now().toString(36)}_${user.uid.slice(0, 6)}`;
  const cleanName = name.trim().slice(0, 120);
  const displayName = (user.displayName || user.email?.split('@')[0] || 'Analista').slice(0, 120);
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'organizations', orgId), {
      id: orgId,
      name: cleanName,
      ...(cnpj?.trim() ? { cnpj: cnpj.trim().slice(0, 24) } : {}),
      ownerId: user.uid,
      planTier: 'institutional',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'organizations', orgId, 'members', user.uid), {
      uid: user.uid,
      orgId,
      role: 'admin',
      displayName,
      addedBy: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'users', user.uid, 'memberships', orgId), {
      orgId,
      orgName: cleanName,
      role: 'admin',
      createdAt: serverTimestamp(),
    });
    await batch.commit();
    return {
      id: orgId,
      name: cleanName,
      cnpj: cnpj?.trim() || undefined,
      ownerId: user.uid,
      planTier: 'institutional',
      role: 'admin',
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `organizations/${orgId}`);
  }
}

export async function loadOrgAnalyses(orgId: string): Promise<Record<string, WorkspaceAnalysisRecord>> {
  const colPath = `organizations/${orgId}/analyses`;
  try {
    const snap = await getDocs(collection(db, 'organizations', orgId, 'analyses'));
    const map: Record<string, WorkspaceAnalysisRecord> = {};
    for (const d of snap.docs) {
      map[d.id] = d.data() as WorkspaceAnalysisRecord;
    }
    return map;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, colPath);
  }
}

export async function saveOrgAssetAnalysis(
  orgId: string,
  user: User,
  payload: {
    ticker: string;
    status: 'rascunho' | 'revisado' | 'aprovado';
    analystNotes: string;
    valuationOverrides?: Partial<ValuationAssumptions>;
    customAssetData?: Record<string, unknown>;
  }
): Promise<void> {
  const ticker = payload.ticker.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  const docPath = `organizations/${orgId}/analyses/${ticker}`;
  try {
    const docRef = doc(db, 'organizations', orgId, 'analyses', ticker);
    const existingSnap = await getDoc(docRef);
    const dataToWrite: Record<string, unknown> = {
      ticker,
      orgId,
      updatedBy: user.uid,
      status: payload.status,
      analystNotes: payload.analystNotes.slice(0, 20000),
      updatedAt: serverTimestamp(),
      createdAt: existingSnap.exists() ? existingSnap.data().createdAt : serverTimestamp(),
    };
    if (payload.valuationOverrides) {
      dataToWrite.valuationOverrides = payload.valuationOverrides;
    }
    if (payload.customAssetData) {
      dataToWrite.customAssetData = payload.customAssetData;
    }
    await setDoc(docRef, dataToWrite);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, docPath);
  }
}

export async function loadOrgWeights(orgId: string): Promise<PillarWeightsConfig | null> {
  const docPath = `organizations/${orgId}/weights/default`;
  try {
    const snap = await getDoc(doc(db, 'organizations', orgId, 'weights', 'default'));
    if (!snap.exists()) return null;
    const data = snap.data() as { weights?: PillarWeightsConfig };
    return data.weights ?? null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, docPath);
  }
}

export async function saveOrgWeights(
  orgId: string,
  user: User,
  weights: PillarWeightsConfig
): Promise<void> {
  const docPath = `organizations/${orgId}/weights/default`;
  try {
    const ref = doc(db, 'organizations', orgId, 'weights', 'default');
    const existingSnap = await getDoc(ref);
    await setDoc(ref, {
      id: 'default',
      orgId,
      name: 'Política Institucional',
      updatedBy: user.uid,
      weights,
      createdAt: existingSnap.exists() ? existingSnap.data().createdAt : serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, docPath);
  }
}

export async function appendOrgAuditLog(
  orgId: string,
  user: User,
  action: string,
  details: string,
  targetTicker?: string
): Promise<void> {
  const logId = `log_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const docPath = `organizations/${orgId}/auditLogs/${logId}`;
  try {
    const displayName = (user.displayName || user.email?.split('@')[0] || 'Analista').slice(0, 120);
    await setDoc(doc(db, 'organizations', orgId, 'auditLogs', logId), {
      id: logId,
      orgId,
      userId: user.uid,
      userDisplayName: displayName,
      action: action.slice(0, 80),
      ...(targetTicker ? { targetTicker: targetTicker.slice(0, 16) } : {}),
      details: details.slice(0, 1000),
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, docPath);
  }
}

export async function loadOrgAuditLogs(orgId: string): Promise<FirestoreAuditEntry[]> {
  const colPath = `organizations/${orgId}/auditLogs`;
  try {
    const q = query(
      collection(db, 'organizations', orgId, 'auditLogs'),
      orderBy('createdAt', 'desc'),
      limit(40)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as FirestoreAuditEntry);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, colPath);
  }
}

export type PriceAlertDirection = 'lte' | 'gte';

export interface PriceAlertRecord {
  ticker: string;
  targetPrice: number;
  direction: PriceAlertDirection;
  enabled: boolean;
  note?: string;
}

export function isPriceAlertTriggered(
  alert: PriceAlertRecord | undefined,
  currentPrice: number
): boolean {
  if (!alert || !alert.enabled || !Number.isFinite(alert.targetPrice) || alert.targetPrice <= 0) {
    return false;
  }
  return alert.direction === 'lte'
    ? currentPrice <= alert.targetPrice
    : currentPrice >= alert.targetPrice;
}

export async function loadOrgPriceAlerts(
  orgId: string
): Promise<Record<string, PriceAlertRecord>> {
  const colPath = `organizations/${orgId}/priceAlerts`;
  try {
    const snap = await getDocs(collection(db, 'organizations', orgId, 'priceAlerts'));
    const map: Record<string, PriceAlertRecord> = {};
    for (const d of snap.docs) {
      const data = d.data() as PriceAlertRecord;
      map[d.id] = {
        ticker: data.ticker,
        targetPrice: Number(data.targetPrice),
        direction: data.direction === 'gte' ? 'gte' : 'lte',
        enabled: Boolean(data.enabled),
        note: data.note,
      };
    }
    return map;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, colPath);
  }
}

export async function saveOrgPriceAlert(
  orgId: string,
  user: User,
  payload: PriceAlertRecord
): Promise<void> {
  const ticker = payload.ticker.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  const docPath = `organizations/${orgId}/priceAlerts/${ticker}`;
  try {
    const ref = doc(db, 'organizations', orgId, 'priceAlerts', ticker);
    const existingSnap = await getDoc(ref);
    const docData: Record<string, unknown> = {
      ticker,
      orgId,
      targetPrice: Number(payload.targetPrice),
      direction: payload.direction,
      enabled: Boolean(payload.enabled),
      updatedBy: user.uid,
      createdAt: existingSnap.exists() ? existingSnap.data().createdAt : serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (payload.note?.trim()) {
      docData.note = payload.note.trim().slice(0, 300);
    }
    await setDoc(ref, docData);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, docPath);
  }
}

export async function deleteOrgPriceAlert(orgId: string, ticker: string): Promise<void> {
  const cleanTicker = ticker.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  const docPath = `organizations/${orgId}/priceAlerts/${cleanTicker}`;
  try {
    await deleteDoc(doc(db, 'organizations', orgId, 'priceAlerts', cleanTicker));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, docPath);
  }
}
