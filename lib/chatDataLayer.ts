"use client";

import {
  collection,
  doc,
  getDoc,
  getDocFromCache,
  getDocs,
  getDocsFromCache,
  limit,
  orderBy,
  query,
  startAfter,
  where,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
  type Query,
  type QuerySnapshot,
  Timestamp,
} from "firebase/firestore";
import { getFirestoreClient } from "@/lib/firebase";

const THREADS_PAGE_SIZE = 20;
const MESSAGES_PAGE_SIZE = 50;

/** Simple in-memory cache + in-flight dedupe to avoid duplicate reads in a session. */
const memCache = new Map<string, { value: unknown; expiresAt: number }>();
const inFlight = new Map<string, Promise<unknown>>();
const MEM_TTL_MS = 30_000;

type ReadCounters = {
  threadsPage: number;
  messagesPage: number;
  threadDelta: number;
  messagesDelta: number;
};

const readCounters: ReadCounters = {
  threadsPage: 0,
  messagesPage: 0,
  threadDelta: 0,
  messagesDelta: 0,
};

function logReads(label: keyof ReadCounters, docs: number) {
  readCounters[label] += docs;
  // Lightweight instrumentation – visible in dev tools
  // eslint-disable-next-line no-console
  console.debug(
    "[chatDataLayer] reads:",
    label,
    "added",
    docs,
    "→ total",
    readCounters[label]
  );
}

function getDbOrThrow(): Firestore {
  const db = getFirestoreClient();
  if (!db) {
    throw new Error("Firestore client not configured");
  }
  return db;
}

function cacheKeyForQuery(q: Query) {
  const anyQ = q as any;
  const path = anyQ._query?.path?.canonicalString?.() ?? "";
  const filters = JSON.stringify(anyQ._query?.filters ?? []);
  const orderBys = JSON.stringify(anyQ._query?.orderBy ?? []);
  const lim = anyQ._query?.limit ?? "";
  return `${path}|f:${filters}|o:${orderBys}|l:${lim}`;
}

function getFromMemCache<T>(key: string): T | null {
  const entry = memCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memCache.delete(key);
    return null;
  }
  return entry.value as T;
}

function setMemCache<T>(key: string, value: T) {
  memCache.set(key, { value, expiresAt: Date.now() + MEM_TTL_MS });
}

export async function cacheFirstGetDoc<T>(
  ref: DocumentReference<T>
): Promise<DocumentSnapshot<T>> {
  const key = ref.path;
  const cached = getFromMemCache<DocumentSnapshot<T>>(key);
  if (cached) return cached;

  try {
    const snap = await getDocFromCache(ref);
    if (snap.exists()) {
      setMemCache(key, snap);
      return snap;
    }
  } catch {
    // ignore cache miss
  }

  const inFlightKey = `doc:${key}`;
  const existing = inFlight.get(inFlightKey) as Promise<DocumentSnapshot<T>> | undefined;
  if (existing) return existing;

  const p = getDoc(ref).finally(() => inFlight.delete(inFlightKey));
  inFlight.set(inFlightKey, p);
  const snap = await p;
  setMemCache(key, snap);
  return snap;
}

export async function cacheFirstGetDocs<T>(
  q: Query<T>
): Promise<QuerySnapshot<T>> {
  const key = cacheKeyForQuery(q as Query);
  const cached = getFromMemCache<QuerySnapshot<T>>(key);
  if (cached) return cached;

  try {
    const snap = await getDocsFromCache(q);
    if (!snap.empty) {
      setMemCache(key, snap);
      return snap;
    }
  } catch {
    // ignore cache miss
  }

  const inFlightKey = `docs:${key}`;
  const existing = inFlight.get(inFlightKey) as Promise<QuerySnapshot<T>> | undefined;
  if (existing) return existing;

  const p = getDocs(q).finally(() => inFlight.delete(inFlightKey));
  inFlight.set(inFlightKey, p);
  const snap = await p;
  setMemCache(key, snap);
  return snap;
}

/** Thread model for chat/prompt history. */
export interface Thread {
  id: string;
  title: string;
  lastMessagePreview: string;
  lastMessageAt: Timestamp;
  lastTouched: Timestamp;
  updatedAt: Timestamp;
  participantsSummary: string;
  unreadCount: number;
}

/** Message model for chat/prompt history. */
export interface Message {
  id: string;
  threadId: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastTouched: Timestamp;
}

export interface PageResult<T> {
  items: T[];
  lastDoc: DocumentSnapshot | null;
}

/** Fetch a page of threads, newest first. */
export async function fetchThreadsPage(opts: {
  pageSize?: number;
  cursor?: DocumentSnapshot | null;
} = {}): Promise<PageResult<Thread>> {
  const db = getDbOrThrow();
  const size = opts.pageSize ?? THREADS_PAGE_SIZE;

  let qBase: Query<Thread>;
  if (opts.cursor) {
    qBase = query(
      collection(db, "threads") as any,
      orderBy("lastMessageAt", "desc"),
      startAfter(opts.cursor),
      limit(size)
    ) as Query<Thread>;
  } else {
    qBase = query(
      collection(db, "threads") as any,
      orderBy("lastMessageAt", "desc"),
      limit(size)
    ) as Query<Thread>;
  }

  const snap = await cacheFirstGetDocs<Thread>(qBase);
  logReads("threadsPage", snap.size);
  const items = snap.docs.map(
    (d) =>
      ({
        id: d.id,
        ...(d.data() as unknown as Omit<Thread, "id">),
      }) as Thread
  );
  const lastDoc = snap.docs.length === size ? snap.docs[snap.docs.length - 1] : null;
  return { items, lastDoc };
}

/** Fetch a page of messages in a thread, newest first (descending). */
export async function fetchMessagesPage(
  threadId: string,
  opts: { pageSize?: number; cursor?: DocumentSnapshot | null } = {}
): Promise<PageResult<Message>> {
  const db = getDbOrThrow();
  const size = opts.pageSize ?? MESSAGES_PAGE_SIZE;

  let qBase: Query<Message>;
  if (opts.cursor) {
    qBase = query(
      collection(db, "messages") as any,
      where("threadId", "==", threadId),
      orderBy("createdAt", "desc"),
      startAfter(opts.cursor),
      limit(size)
    ) as Query<Message>;
  } else {
    qBase = query(
      collection(db, "messages") as any,
      where("threadId", "==", threadId),
      orderBy("createdAt", "desc"),
      limit(size)
    ) as Query<Message>;
  }

  const snap = await cacheFirstGetDocs<Message>(qBase);
  logReads("messagesPage", snap.size);
  const items = snap.docs.map(
    (d) =>
      ({
        id: d.id,
        ...(d.data() as unknown as Omit<Message, "id">),
      }) as Message
  );
  const lastDoc = snap.docs.length === size ? snap.docs[snap.docs.length - 1] : null;
  return { items, lastDoc };
}

/** Delta sync for threads since lastSyncMillis. */
export async function syncThreadsSince(lastSyncMillis: number): Promise<Thread[]> {
  const db = getDbOrThrow();
  const ts = Timestamp.fromMillis(lastSyncMillis);

  const qBase = query(
    collection(db, "threads") as any,
    where("updatedAt", ">", ts),
    orderBy("updatedAt", "asc"),
    limit(100)
  ) as Query<Thread>;

  const snap = await cacheFirstGetDocs<Thread>(qBase);
  logReads("threadDelta", snap.size);
  return snap.docs.map(
    (d) =>
      ({
        id: d.id,
        ...(d.data() as unknown as Omit<Thread, "id">),
      }) as Thread
  );
}

/** Delta sync for messages in a thread since lastSyncMillis. */
export async function syncMessagesSince(
  threadId: string,
  lastSyncMillis: number
): Promise<Message[]> {
  const db = getDbOrThrow();
  const ts = Timestamp.fromMillis(lastSyncMillis);

  const qBase = query(
    collection(db, "messages") as any,
    where("threadId", "==", threadId),
    where("updatedAt", ">", ts),
    orderBy("updatedAt", "asc"),
    limit(200)
  ) as Query<Message>;

  const snap = await cacheFirstGetDocs<Message>(qBase);
  logReads("messagesDelta", snap.size);
  return snap.docs.map(
    (d) =>
      ({
        id: d.id,
        ...(d.data() as unknown as Omit<Message, "id">),
      }) as Message
  );
}

