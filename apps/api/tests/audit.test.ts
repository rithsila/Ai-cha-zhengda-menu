import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../src/app';
import { recordAuditLog } from '../src/audit';
import { issueToken, clearSessions, getStaffSessionInfo } from '../src/auth';

describe('Audit Logging System', () => {
  beforeEach(async () => {
    await prisma.auditLog.deleteMany({});
    clearSessions();
  });

  it('records an audit log entry successfully', async () => {
    await recordAuditLog(prisma, {
      actorType: 'manager',
      actorId: 'admin-1',
      actorName: 'Admin',
      action: 'PRICE_UPDATE',
      entityType: 'menu_item',
      entityId: 'a1',
      oldValue: { basePrice: 2.0 },
      newValue: { basePrice: 2.5 },
      metadata: { reason: 'Sugar inflation' },
    });

    const logs = await prisma.auditLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('PRICE_UPDATE');
    expect(logs[0].actorName).toBe('Admin');
    expect(JSON.parse(logs[0].oldValue!)).toEqual({ basePrice: 2.0 });
    expect(JSON.parse(logs[0].newValue!)).toEqual({ basePrice: 2.5 });
    expect(JSON.parse(logs[0].metadata!)).toEqual({ reason: 'Sugar inflation' });
  });

  it('handles string or undefined values for oldValue, newValue, and metadata', async () => {
    await recordAuditLog(prisma, {
      actorType: 'staff',
      action: 'ITEM_SOLD_OUT_TOGGLED',
      entityType: 'menu_item',
      entityId: 'item-2',
      oldValue: 'false',
      newValue: 'true',
    });

    const logs = await prisma.auditLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('ITEM_SOLD_OUT_TOGGLED');
    expect(logs[0].oldValue).toBe('false');
    expect(logs[0].newValue).toBe('true');
    expect(logs[0].metadata).toBeNull();
    expect(logs[0].actorId).toBeNull();
    expect(logs[0].actorName).toBeNull();
  });

  it('never throws even if writing to database fails', async () => {
    const mockPrisma = {
      auditLog: {
        create: () => Promise.reject(new Error('DB connection failed')),
      },
    };

    await expect(
      recordAuditLog(mockPrisma as any, {
        actorType: 'system',
        action: 'TEST_ERROR',
        entityType: 'order',
      })
    ).resolves.not.toThrow();
  });

  it('extracts staff session info correctly via getStaffSessionInfo', () => {
    const { token } = issueToken('manager', { name: 'Manager Bob', telegramUserId: '12345' });
    const req = {
      headers: {
        authorization: `Bearer ${token}`,
      },
    };

    const sessionInfo = getStaffSessionInfo(req);
    expect(sessionInfo).not.toBeNull();
    expect(sessionInfo?.role).toBe('manager');
    expect(sessionInfo?.name).toBe('Manager Bob');
    expect(sessionInfo?.telegramUserId).toBe('12345');
  });

  it('returns null from getStaffSessionInfo when token is missing or invalid', () => {
    expect(getStaffSessionInfo({ headers: {} })).toBeNull();
    expect(getStaffSessionInfo({ headers: { authorization: 'Bearer invalid-token' } })).toBeNull();
  });
});
