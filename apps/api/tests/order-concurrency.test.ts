import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { createApp, prisma } from '../src/app';
import { tuneSqliteUrl, withWriteRetry } from '../src/db';
import { asCustomer } from './helpers/customer';

/**
 * SQLite takes one writer at a time. A rush of checkouts used to lose most of
 * the orders: the transaction gave up with "P1008 Socket timeout" and the
 * customer saw "Failed to create order". Measured on the running server before
 * the fix: 9 of 20 and 8 of 30 saved.
 *
 * Note on what this file can and cannot prove. supertest drives the app inside
 * this one process, and that does not reproduce real lock contention — the
 * requests end up interleaved rather than genuinely racing, so the rush test
 * below passes even with the tuning switched off. It is still worth having: it
 * pins the *correctness* half (every order saved, one row each, points spent
 * exactly once). The contention half is covered by the settings assertions and
 * by the retry unit tests, and was measured for real against a running server.
 */

const app = createApp();
const uid = `conc-${randomUUID()}`;
const itemId = `conc-item-${randomUUID()}`;
const ITEM_PRICE = 5.0;
const START_POINTS = 100_000;
const POINTS_PER_ORDER = 10;
const CONCURRENT = 50;

beforeAll(async () => {
  await prisma.systemConfig.deleteMany({
    where: { key: { in: ['pointsPerDollar', 'earnPointsPerDollar'] } },
  });
  await prisma.user.create({ data: { telegramUserId: uid, loyaltyPoints: START_POINTS } });
  await prisma.menuItem.create({
    data: { id: itemId, brand: 'ai-cha', category: 'Test', name: 'Rush Tea', basePrice: ITEM_PRICE },
  });
});

const checkout = () =>
  request(app).post('/api/orders').set(asCustomer(uid)).send({
    items: [{ menuItemId: itemId, quantity: 1, selectedModifiers: {} }],
    paymentMethod: 'khqr',
    orderType: 'pickup',
    pointsToUse: POINTS_PER_ORDER,
  });

describe('POST /api/orders under a rush', () => {
  it(`saves all ${CONCURRENT} orders and spends the points exactly once each`, async () => {
    const before = (await prisma.user.findUnique({ where: { telegramUserId: uid } }))!.loyaltyPoints;

    const results = await Promise.all(Array.from({ length: CONCURRENT }, () => checkout()));

    const failed = results.filter((r) => r.status !== 200);
    expect(failed.map((r) => `${r.status} ${JSON.stringify(r.body)}`)).toEqual([]);

    // Every order is its own row — a retry must never have written two.
    const ids = new Set(results.map((r) => r.body.id));
    expect(ids.size).toBe(CONCURRENT);
    const saved = await prisma.order.count({ where: { telegramUserId: uid } });
    expect(saved).toBe(CONCURRENT);

    // ...and every order reserved its points once, no more and no less.
    for (const r of results) expect(r.body.pointsRedeemed).toBe(POINTS_PER_ORDER);
    const after = (await prisma.user.findUnique({ where: { telegramUserId: uid } }))!.loyaltyPoints;
    expect(after).toBe(before - CONCURRENT * POINTS_PER_ORDER);
  }, 60_000);
});

describe('SQLite connection tuning', () => {
  // busy_timeout cannot be stored in the database file, so it has to ride on
  // the connection string to reach every connection the pool opens.
  it('adds the lock and pool settings to a sqlite url', () => {
    const tuned = new URL(tuneSqliteUrl('file:./dev.db').replace('file:', 'file://'));
    expect(tuned.searchParams.get('socket_timeout')).toBe('15');
    expect(tuned.searchParams.get('connection_limit')).toBe('1');
    expect(tuned.searchParams.get('pool_timeout')).toBe('20');
  });

  it('does not overwrite a setting the operator chose', () => {
    const tuned = tuneSqliteUrl('file:./dev.db?socket_timeout=60');
    expect(tuned).toContain('socket_timeout=60');
  });

  it('leaves a non-sqlite url alone', () => {
    expect(tuneSqliteUrl('postgresql://localhost/x')).toBe('postgresql://localhost/x');
  });

  it('really applies the pragmas to the live connection', async () => {
    const [{ timeout }] = await prisma.$queryRawUnsafe<{ timeout: bigint }[]>('PRAGMA busy_timeout');
    expect(Number(timeout)).toBe(15_000);
    const [{ journal_mode }] = await prisma.$queryRawUnsafe<{ journal_mode: string }[]>('PRAGMA journal_mode');
    expect(journal_mode).toBe('wal');
  });
});

describe('withWriteRetry', () => {
  const busy = () => Object.assign(new Error('SQLITE_BUSY: database is locked'), { code: 'P2034' });

  it('retries a busy lock and returns the later success', async () => {
    let calls = 0;
    const result = await withWriteRetry(async () => {
      calls += 1;
      if (calls < 3) throw busy();
      return 'saved';
    });
    expect(result).toBe('saved');
    expect(calls).toBe(3);
  });

  it('gives up after a bounded number of attempts instead of looping for ever', async () => {
    let calls = 0;
    await expect(withWriteRetry(async () => { calls += 1; throw busy(); })).rejects.toThrow(/SQLITE_BUSY/);
    expect(calls).toBeLessThanOrEqual(5);
    expect(calls).toBeGreaterThan(1);
  });

  // A retry loop must not swallow a validation or constraint failure.
  it('re-throws anything that is not lock contention, without retrying', async () => {
    let calls = 0;
    await expect(withWriteRetry(async () => {
      calls += 1;
      throw new Error('Unique constraint failed');
    })).rejects.toThrow(/Unique constraint/);
    expect(calls).toBe(1);
  });

  // How POST /api/orders stays idempotent: the id is minted first, so a retry
  // can tell "the transaction rolled back" from "it actually committed".
  it('tells the caller which attempt it is on, so a retry can be made idempotent', async () => {
    const seen: number[] = [];
    await withWriteRetry(async (attempt) => {
      seen.push(attempt);
      if (attempt === 0) throw busy();
      return null;
    });
    expect(seen).toEqual([0, 1]);
  });
});

describe('POST /api/orders idempotency on retry', () => {
  // Simulates the dangerous case directly: the first transaction commits and
  // then the driver reports a lock timeout anyway. The retry must find the row
  // it already wrote and hand it back, not create a second order and charge the
  // points twice.
  it('returns the committed order instead of writing a second one', async () => {
    const orderId = randomUUID();
    const before = (await prisma.user.findUnique({ where: { telegramUserId: uid } }))!.loyaltyPoints;

    const order = await withWriteRetry(async (attempt) => {
      if (attempt > 0) {
        const existing = await prisma.order.findUnique({ where: { id: orderId } });
        if (existing) return existing;
      }
      const created = await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { telegramUserId: uid },
          data: { loyaltyPoints: { decrement: POINTS_PER_ORDER } },
        });
        return tx.order.create({
          data: { id: orderId, totalAmount: 1, paymentMethod: 'cash', telegramUserId: uid, pointsRedeemed: POINTS_PER_ORDER },
        });
      });
      if (attempt === 0) throw Object.assign(new Error('SQLITE_BUSY after commit'), { code: 'P1008' });
      return created;
    });

    expect(order.id).toBe(orderId);
    const after = (await prisma.user.findUnique({ where: { telegramUserId: uid } }))!.loyaltyPoints;
    expect(after).toBe(before - POINTS_PER_ORDER); // charged once, not twice
    expect(await prisma.order.count({ where: { id: orderId } })).toBe(1);
  });
});
