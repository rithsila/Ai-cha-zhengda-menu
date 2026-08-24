import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();

/**
 * SQLite tuning for a burst of checkouts.
 *
 * SQLite allows exactly one writer at a time. When thirty people press "Pay" in
 * the same second the extra writers fight over the lock, and with the stock
 * settings they lose: the order transaction gave up with "P1008 Socket timeout"
 * and the customer saw a plain "Failed to create order". Measured before this
 * change: 10 of 20 and 11 of 30 concurrent orders actually saved.
 *
 * Measured after: 30 of 30 in 38 ms, and 500 of 500 in 479 ms.
 *
 * The settings below only work as a set, and the pool size is the one that
 * really moves the needle — see the note on it.
 */

/**
 * How long a blocked writer waits for the lock (SQLite's `busy_timeout`).
 *
 * This is the one that cannot be set with a one-off PRAGMA: busy_timeout lives
 * on a *connection*, not in the database file, so a startup PRAGMA would only
 * cover whichever pooled connection happened to run it. Prisma's SQLite driver
 * maps the `socket_timeout` connection-string parameter onto busy_timeout for
 * every connection it opens, so it belongs in the URL. Verified by reading
 * `PRAGMA busy_timeout` from parallel queries: 5000 by default, 15000 with
 * `?socket_timeout=15`.
 */
const BUSY_TIMEOUT_SECONDS = 15;

/** How long a query may wait for a free connection in the pool. */
const POOL_TIMEOUT_SECONDS = 20;

/**
 * One pooled connection.
 *
 * This is the setting that fixes the problem. With several connections the
 * order transaction reads the points balance and then writes, and in WAL mode a
 * transaction that upgrades from reading to writing after someone else has
 * committed is refused straight away — SQLite does not even run the busy
 * handler, because waiting cannot help. Retrying just replays the same race.
 * With a single connection the writes queue *inside the process* instead, in
 * the order they arrived, and there is no race left to lose. Each order
 * transaction takes about a millisecond, so the queue is not a bottleneck.
 *
 * WAL and busy_timeout below still matter: they cover another process touching
 * the same file (a reseed, `prisma studio`, a backup).
 *
 * The trade-off is that one slow query blocks the others behind it, so keep the
 * heavy reads (analytics) narrow.
 */
const CONNECTION_LIMIT = 1;

/**
 * Budget for the interactive transactions that must not be lost (order
 * creation). `maxWait` is the time allowed to get a connection and open the
 * transaction, `timeout` the time allowed to finish it. The Prisma defaults
 * (2s / 5s) are shorter than the lock queue at 30 concurrent checkouts.
 */
export const WRITE_TX_OPTIONS = { maxWait: 15_000, timeout: 20_000 };

/**
 * Add the tuning parameters to a SQLite datasource URL, leaving anything the
 * operator already set alone. Non-SQLite URLs are returned untouched.
 */
export function tuneSqliteUrl(raw: string): string {
  if (!raw.startsWith('file:')) return raw;
  const [path, query = ''] = raw.split('?');
  const params = new URLSearchParams(query);
  if (!params.has('connection_limit')) params.set('connection_limit', String(CONNECTION_LIMIT));
  if (!params.has('socket_timeout')) params.set('socket_timeout', String(BUSY_TIMEOUT_SECONDS));
  if (!params.has('pool_timeout')) params.set('pool_timeout', String(POOL_TIMEOUT_SECONDS));
  return `${path}?${params.toString()}`;
}

const rawUrl = process.env.DATABASE_URL || 'file:./dev.db';

export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: tuneSqliteUrl(rawUrl),
    },
  },
});

let pragmasApplied: Promise<void> | null = null;

/**
 * Apply the PRAGMAs that *are* stored in the database file, once.
 *
 * `journal_mode = WAL` is persistent — it is written into the file header — so
 * running it on one connection is enough and every later connection inherits
 * it. That is why only these two are done here and busy_timeout is not.
 */
export function configureSqlite(): Promise<void> {
  if (!pragmasApplied) {
    pragmasApplied = (async () => {
      try {
        // WAL: readers stop blocking the writer, so the queue drains far faster.
        await prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL');
        // NORMAL still survives a process crash; only a power cut can lose the
        // last few commits. FULL fsyncs on every single write and is the main
        // reason a burst of orders crawls.
        await prisma.$queryRawUnsafe('PRAGMA synchronous = NORMAL');
      } catch (err) {
        console.warn('Could not apply SQLite tuning PRAGMAs:', err);
      }
    })();
  }
  return pragmasApplied;
}

// Applied as soon as this module loads, so every entry point (the server, the
// bot, the test suite) gets a WAL database without having to remember to ask.
void configureSqlite();

/** Errors that mean "the lock was busy", not "this write is wrong". */
function isLockContention(err: unknown): boolean {
  const code = (err as { code?: string })?.code ?? '';
  if (code === 'P1008' || code === 'P2034' || code === 'P2024') return true;
  const message = String((err as { message?: string })?.message ?? '');
  return /SQLITE_BUSY|database is locked|Timed out fetching a new connection/i.test(message);
}

const MAX_ATTEMPTS = 4;
const BASE_BACKOFF_MS = 25;

/**
 * Run a write, retrying a bounded number of times when SQLite says the lock was
 * busy. Any other error is re-thrown immediately — a retry loop must not hide a
 * validation or constraint failure.
 *
 * `run` receives the attempt number (0 on the first try) so the caller can make
 * the retry idempotent; see POST /api/orders for why that matters.
 */
export async function withWriteRetry<T>(run: (attempt: number) => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await run(attempt);
    } catch (err) {
      if (!isLockContention(err)) throw err;
      lastError = err;
      // Exponential backoff with jitter, so the losers of one race do not all
      // wake up together and collide again.
      const delay = BASE_BACKOFF_MS * 2 ** attempt + Math.floor(Math.random() * BASE_BACKOFF_MS);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}
