import { useCallback, useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  FileText,
  RotateCcw,
  Search,
  ShieldCheck,
  User,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  Badge,
  Button,
  Card,
  CustomSelect,
  EmptyState,
  Skeleton,
  useToast,
} from './ui';
import type { BadgeVariant } from './ui';

export interface AuditLogItem {
  id: string;
  actorType: 'staff' | 'manager' | 'customer' | 'system';
  actorId: string | null;
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  oldValue: string | null;
  newValue: string | null;
  metadata: string | null;
  createdAt: string;
}

interface AuditLogsResponse {
  logs: AuditLogItem[];
  total: number;
}

const ACTION_FILTER_OPTIONS = [
  { value: '', label: 'All Actions' },
  { value: 'PAYMENT_', label: 'Payments' },
  { value: 'ITEM_PRICE_UPDATE', label: 'Price Changes' },
  { value: 'ORDER_', label: 'Order Status' },
  { value: 'ITEM_SOLD_OUT_TOGGLED', label: 'Sold Out' },
];

function tryParseJson(val: string | null): Record<string, any> | null {
  if (!val) return null;
  try {
    const parsed = JSON.parse(val);
    if (typeof parsed === 'object' && parsed !== null) return parsed;
    return null;
  } catch {
    return null;
  }
}

function getActionBadgeProps(action: string, newValue?: string | null): { variant: BadgeVariant; label: string } {
  const upper = action.toUpperCase();

  if (upper === 'PAYMENT_APPROVED') {
    return { variant: 'success', label: 'Payment Approved' };
  }
  if (upper === 'PAYMENT_INITIATED') {
    return { variant: 'delivery', label: 'Payment Initiated' };
  }
  if (upper === 'PAYMENT_WEBHOOK_RECEIVED') {
    return { variant: 'delivery', label: 'Webhook Received' };
  }
  if (upper === 'PAYMENT_MISMATCH') {
    return { variant: 'danger', label: 'Payment Mismatch' };
  }
  if (upper === 'ITEM_PRICE_UPDATE') {
    return { variant: 'pending', label: 'Price Change' };
  }
  if (upper === 'ITEM_UPDATE') {
    return { variant: 'pending', label: 'Item Config' };
  }
  if (upper === 'ITEM_CREATE') {
    return { variant: 'delivery', label: 'Item Created' };
  }
  if (upper === 'ITEM_SOLD_OUT_TOGGLED') {
    return { variant: 'pending', label: 'Sold Out Status' };
  }
  if (upper === 'ITEM_DELETED') {
    return { variant: 'danger', label: 'Item Deleted' };
  }
  if (upper === 'ITEM_ARCHIVED') {
    return { variant: 'danger', label: 'Item Archived' };
  }
  if (upper === 'ORDER_CANCELLED') {
    return { variant: 'danger', label: 'Order Cancelled' };
  }
  if (upper === 'ORDER_STATUS_CHANGED') {
    if (newValue === 'completed' || newValue === 'paid') {
      return { variant: 'success', label: `Status: ${newValue}` };
    }
    if (newValue === 'cancelled') {
      return { variant: 'danger', label: 'Status: Cancelled' };
    }
    if (newValue === 'preparing' || newValue === 'ready') {
      return { variant: 'delivery', label: `Status: ${newValue}` };
    }
    return { variant: 'default', label: 'Status Changed' };
  }

  return { variant: 'default', label: action };
}

function formatActorLabel(log: AuditLogItem): string {
  if (log.actorName) {
    return `${log.actorName} (${log.actorType})`;
  }
  if (log.actorId) {
    return `${log.actorId} (${log.actorType})`;
  }
  return log.actorType;
}

function formatTarget(log: AuditLogItem): string {
  if (!log.entityId) return log.entityType;
  if (log.entityType === 'order') {
    return `Order #${log.entityId.slice(0, 8)}`;
  }
  if (log.entityType === 'menu_item') {
    return `Item #${log.entityId.slice(0, 8)}`;
  }
  if (log.entityType === 'payment') {
    return `Order #${log.entityId.slice(0, 8)}`;
  }
  return `${log.entityType}: ${log.entityId.slice(0, 8)}`;
}

function formatDetailsSummary(log: AuditLogItem): string {
  const meta = tryParseJson(log.metadata);
  const oldVal = tryParseJson(log.oldValue);
  const newVal = tryParseJson(log.newValue);

  if (log.action === 'ITEM_PRICE_UPDATE') {
    const oldP = oldVal?.basePrice !== undefined ? `$${Number(oldVal.basePrice).toFixed(2)}` : '';
    const newP = newVal?.basePrice !== undefined ? `$${Number(newVal.basePrice).toFixed(2)}` : '';
    if (oldP && newP) return `Price: ${oldP} → ${newP}`;
  }

  if (log.action === 'ITEM_SOLD_OUT_TOGGLED') {
    const sold = log.newValue === 'true' || Boolean(newVal?.isSoldOut);
    return sold ? 'Status: Sold Out' : 'Status: In Stock';
  }

  if (log.action === 'ORDER_STATUS_CHANGED') {
    const from = log.oldValue || oldVal?.status || '';
    const to = log.newValue || newVal?.status || '';
    const reason = meta?.cancelReason ? ` (Reason: ${meta.cancelReason})` : '';
    if (from && to) return `${from} → ${to}${reason}`;
    if (to) return `Status: ${to}${reason}`;
  }

  if (log.action === 'ORDER_CANCELLED') {
    const reason = meta?.cancelReason || meta?.reason;
    return reason ? `Cancelled: ${reason}` : 'Cancelled by customer';
  }

  if (log.action.startsWith('PAYMENT_')) {
    const parts: string[] = [];
    const tranId = meta?.tranId || meta?.tran_id;
    if (tranId) parts.push(`Tran: ${tranId}`);
    if (meta?.amount !== undefined) parts.push(`$${Number(meta.amount).toFixed(2)}`);
    if (meta?.expectedAmount !== undefined && meta?.receivedAmount !== undefined) {
      parts.push(`Expected: $${meta.expectedAmount}, Got: $${meta.receivedAmount}`);
    }
    if (parts.length > 0) return parts.join(' | ');
  }

  if (log.action === 'ITEM_UPDATE') {
    const keys = Object.keys(newVal || {});
    if (keys.length > 0) {
      return `Updated: ${keys.slice(0, 3).join(', ')}${keys.length > 3 ? '...' : ''}`;
    }
  }

  if (log.action === 'ITEM_ARCHIVED') {
    return 'Soft-deleted (archived)';
  }

  if (log.action === 'ITEM_DELETED') {
    return 'Permanently deleted';
  }

  if (meta && Object.keys(meta).length > 0) {
    return Object.entries(meta)
      .slice(0, 2)
      .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
      .join(' | ');
  }

  return '—';
}

function formatJsonBlock(value: string | null): string {
  if (!value) return 'None';
  try {
    const parsed = JSON.parse(value);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return value;
  }
}

export function AuditLogView() {
  const { toast } = useToast();
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filter state
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [page, setPage] = useState(1);
  const limit = 25;

  // Modal inspection state
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);

  // Debounce search query input (300ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setSearchQuery(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchInput]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set('search', searchQuery);
      if (actionFilter) params.set('action', actionFilter);
      params.set('limit', String(limit));
      params.set('offset', String((page - 1) * limit));

      const res = await apiFetch<AuditLogsResponse>(`/api/audit-logs?${params.toString()}`);
      setLogs(res.logs || []);
      setTotal(res.total || 0);
    } catch {
      toast({
        title: "Couldn't load audit logs",
        variant: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [searchQuery, actionFilter, page, toast]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base sm:text-lg font-black tracking-tight text-ink">
            Audit Logs
          </h2>
          <p className="text-xs text-ink-soft">
            Track system transactions, price updates, order changes, and ABA payments
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="default">
            {total} Total Events
          </Badge>
          <Button
            variant="secondary"
            size="sm"
            onClick={fetchLogs}
            disabled={loading}
            className="gap-1.5"
            aria-label="Refresh audit logs"
          >
            <RotateCcw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <Card padding="md" className="border-border bg-surface rounded-none">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {/* Search Box */}
          <div className="relative sm:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-faint pointer-events-none" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search Order ID, ABA Tran ID, Item ID, or Staff..."
              className="w-full h-10 rounded-none border border-border bg-surface-sunken/40 pl-9 pr-8 text-xs font-semibold text-ink placeholder:text-ink-faint focus:border-accent focus:bg-surface focus:outline-none"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-ink-faint hover:text-ink cursor-pointer"
                aria-label="Clear search"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {/* Action Filter Dropdown */}
          <div>
            <CustomSelect
              value={actionFilter}
              onChange={(val) => {
                setActionFilter(val);
                setPage(1);
              }}
              options={ACTION_FILTER_OPTIONS}
              buttonClassName="h-10 text-xs font-bold bg-surface-sunken/40"
            />
          </div>
        </div>
      </Card>

      {/* Main Content Table */}
      <Card padding="none" className="border-border bg-surface rounded-none overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-4">
            <Skeleton className="h-12 w-full rounded-none" />
            <Skeleton className="h-12 w-full rounded-none" />
            <Skeleton className="h-12 w-full rounded-none" />
            <Skeleton className="h-12 w-full rounded-none" />
          </div>
        ) : logs.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={<FileText className="size-10 text-ink-faint" />}
              title="No Audit Logs Found"
              description={
                searchQuery || actionFilter
                  ? 'No logs match your filter criteria. Try clearing filters.'
                  : 'System activity and transactions will appear here as they occur.'
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border bg-surface-sunken/50 text-[11px] font-bold uppercase tracking-wider text-ink-faint">
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Actor</th>
                  <th className="py-3 px-4">Target</th>
                  <th className="py-3 px-4">Details Preview</th>
                  <th className="py-3 px-4 text-right">Raw</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs.map((log) => {
                  const badge = getActionBadgeProps(log.action, log.newValue);
                  const formattedTime = new Date(log.createdAt).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  });

                  return (
                    <tr
                      key={log.id}
                      onClick={() => setSelectedLog(log)}
                      className="hover:bg-surface-sunken/60 cursor-pointer transition-colors"
                    >
                      {/* Timestamp */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-ink-soft font-mono text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <Clock className="size-3 text-ink-faint shrink-0" />
                          <span>{formattedTime}</span>
                        </div>
                      </td>

                      {/* Action Badge */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <Badge variant={badge.variant} className="font-bold">
                          {badge.label}
                        </Badge>
                      </td>

                      {/* Actor Badge */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-ink">
                        <div className="flex items-center gap-1.5 font-medium">
                          {log.actorType === 'manager' || log.actorType === 'staff' ? (
                            <User className="size-3.5 text-accent shrink-0" />
                          ) : (
                            <ShieldCheck className="size-3.5 text-ink-faint shrink-0" />
                          )}
                          <span>{formatActorLabel(log)}</span>
                        </div>
                      </td>

                      {/* Target */}
                      <td className="py-3.5 px-4 whitespace-nowrap font-mono text-[11px] text-ink-soft">
                        {formatTarget(log)}
                      </td>

                      {/* Details Preview */}
                      <td className="py-3.5 px-4 text-ink-soft max-w-xs truncate">
                        {formatDetailsSummary(log)}
                      </td>

                      {/* Details Button */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedLog(log);
                          }}
                          className="inline-flex items-center gap-1 rounded-none px-2 py-1 text-[11px] font-bold text-accent hover:bg-surface-sunken cursor-pointer"
                          aria-label={`View full details for log ${log.id}`}
                        >
                          <Eye className="size-3.5" />
                          <span>View</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs text-ink-soft bg-surface-sunken/20">
            <div>
              Showing{' '}
              <span className="font-bold text-ink">
                {(page - 1) * limit + 1}
              </span>{' '}
              to{' '}
              <span className="font-bold text-ink">
                {Math.min(page * limit, total)}
              </span>{' '}
              of <span className="font-bold text-ink">{total}</span> logs
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="gap-1"
                aria-label="Previous page"
              >
                <ChevronLeft className="size-3.5" />
                <span>Prev</span>
              </Button>

              <span className="px-2 font-mono text-xs font-bold text-ink">
                {page} / {totalPages}
              </span>

              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
                className="gap-1"
                aria-label="Next page"
              >
                <span>Next</span>
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Raw JSON & Metadata Inspection Modal */}
      {selectedLog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          onClick={() => setSelectedLog(null)}
        >
          <div
            className="relative w-full max-w-2xl rounded-none border border-border bg-surface p-6 shadow-2xl z-10 space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <FileText className="size-5 text-accent" />
                <div>
                  <h3 className="text-base font-bold text-ink">
                    Audit Log Details
                  </h3>
                  <p className="text-xs font-mono text-ink-faint">
                    ID: {selectedLog.id}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="rounded-none p-1 text-ink-soft hover:bg-surface-sunken hover:text-ink cursor-pointer"
                aria-label="Close modal"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Quick Summary Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-surface-sunken/40 p-3 text-xs">
              <div>
                <span className="text-ink-faint block text-[10px] uppercase font-bold">Action</span>
                <span className="font-bold text-ink">{selectedLog.action}</span>
              </div>
              <div>
                <span className="text-ink-faint block text-[10px] uppercase font-bold">Actor</span>
                <span className="font-bold text-ink">{formatActorLabel(selectedLog)}</span>
              </div>
              <div>
                <span className="text-ink-faint block text-[10px] uppercase font-bold">Target</span>
                <span className="font-mono text-ink">{formatTarget(selectedLog)}</span>
              </div>
              <div>
                <span className="text-ink-faint block text-[10px] uppercase font-bold">Recorded</span>
                <span className="text-ink font-mono text-[11px]">
                  {new Date(selectedLog.createdAt).toLocaleString()}
                </span>
              </div>
            </div>

            {/* Metadata Section */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-ink-soft mb-1.5">
                Metadata / Transaction Context
              </h4>
              <pre className="bg-surface-sunken p-3 text-xs font-mono text-ink rounded-none overflow-x-auto border border-border">
                {formatJsonBlock(selectedLog.metadata)}
              </pre>
            </div>

            {/* Old vs New Value comparison */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-ink-soft mb-1.5">
                  Old Value (Before)
                </h4>
                <pre className="bg-surface-sunken p-3 text-xs font-mono text-ink rounded-none overflow-x-auto border border-border max-h-48">
                  {formatJsonBlock(selectedLog.oldValue)}
                </pre>
              </div>
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-ink-soft mb-1.5">
                  New Value (After)
                </h4>
                <pre className="bg-surface-sunken p-3 text-xs font-mono text-ink rounded-none overflow-x-auto border border-border max-h-48">
                  {formatJsonBlock(selectedLog.newValue)}
                </pre>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex justify-end pt-2 border-t border-border">
              <Button
                variant="secondary"
                size="md"
                onClick={() => setSelectedLog(null)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
