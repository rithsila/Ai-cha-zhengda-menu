export interface AuditLogEntry {
  actorType: 'staff' | 'manager' | 'customer' | 'system';
  actorId?: string | null;
  actorName?: string | null;
  action: string;
  entityType: 'order' | 'payment' | 'menu_item' | 'category' | 'store_config' | 'staff';
  entityId?: string | null;
  oldValue?: Record<string, any> | string | null;
  newValue?: Record<string, any> | string | null;
  metadata?: Record<string, any> | string | null;
}

export async function recordAuditLog(prisma: any, entry: AuditLogEntry): Promise<void> {
  try {
    const stringify = (val: any) => {
      if (val === undefined || val === null) return null;
      if (typeof val === 'string') return val;
      return JSON.stringify(val);
    };

    await prisma.auditLog.create({
      data: {
        actorType: entry.actorType,
        actorId: entry.actorId ?? null,
        actorName: entry.actorName ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        oldValue: stringify(entry.oldValue),
        newValue: stringify(entry.newValue),
        metadata: stringify(entry.metadata),
      },
    });
  } catch (error) {
    console.error('Failed to write audit log:', error);
  }
}
