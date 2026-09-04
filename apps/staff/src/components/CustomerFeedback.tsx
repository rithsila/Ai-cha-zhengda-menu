import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle,
  Clock,
  MessageSquare,
  Phone,
  Trash2,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { Badge, Button, Card, EmptyState, Skeleton, useToast } from './ui';

export type FeedbackReport = {
  id: string;
  telegramUserId?: string | null;
  userName?: string | null;
  userPhone?: string | null;
  message: string;
  status: 'new' | 'reviewed' | 'resolved';
  createdAt: string;
};

export function CustomerFeedback() {
  const { toast } = useToast();
  const [feedbacks, setFeedbacks] = useState<FeedbackReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  const fetchFeedbacks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<FeedbackReport[]>('/api/feedback');
      setFeedbacks(data);
    } catch {
      toast({
        title: "Couldn't load feedback reports",
        variant: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchFeedbacks();
  }, [fetchFeedbacks]);

  const handleUpdateStatus = async (id: string, status: 'new' | 'reviewed' | 'resolved') => {
    setActionId(id);
    try {
      const updated = await apiFetch<FeedbackReport>(`/api/feedback/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      setFeedbacks((prev) => prev.map((f) => (f.id === id ? updated : f)));
      toast({
        title: status === 'resolved' ? 'Marked as Resolved' : 'Status updated',
        variant: 'success',
      });
    } catch {
      toast({ title: "Couldn't update status", variant: 'error' });
    } finally {
      setActionId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setActionId(id);
    try {
      await apiFetch(`/api/feedback/${id}`, { method: 'DELETE' });
      setFeedbacks((prev) => prev.filter((f) => f.id !== id));
      toast({ title: 'Feedback report deleted', variant: 'info' });
    } catch {
      toast({ title: "Couldn't delete report", variant: 'error' });
    } finally {
      setActionId(null);
    }
  };

  const newCount = feedbacks.filter((f) => f.status === 'new').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-ink">Customer Reports &amp; Feedback</h3>
          <p className="text-xs text-ink-soft">
            Issues and feedback submitted by customers via Telegram bot (/report or /feedback)
          </p>
        </div>
        <Badge variant="default">
          {feedbacks.length} Total {newCount > 0 ? `(${newCount} new)` : ''}
        </Badge>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-none" />
          <Skeleton className="h-24 w-full rounded-none" />
          <Skeleton className="h-24 w-full rounded-none" />
        </div>
      ) : feedbacks.length === 0 ? (
        <EmptyState
          icon={<MessageSquare className="size-10" />}
          title="No Customer Feedback"
          description="When customers send suggestions or issues, they will appear here."
        />
      ) : (
        <div className="space-y-3">
          {feedbacks.map((item) => {
            const isNew = item.status === 'new';
            const isResolved = item.status === 'resolved';

            return (
              <Card
                key={item.id}
                padding="lg"
                className={`border transition-all duration-150 rounded-none ${
                  isNew
                    ? 'border-accent/40 bg-accent-soft/20 shadow-xs'
                    : 'border-border bg-surface'
                }`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-2 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant={
                          isNew
                            ? 'danger'
                            : isResolved
                              ? 'ready'
                              : 'preparing'
                        }
                      >
                        {item.status.toUpperCase()}
                      </Badge>

                      <span className="text-sm font-bold text-ink">
                        {item.userName || 'Customer'}
                      </span>

                      {item.telegramUserId && (
                        <span className="font-mono text-xs text-ink-faint">
                          (ID: {item.telegramUserId})
                        </span>
                      )}

                      {item.userPhone && (
                        <a
                          href={`tel:${item.userPhone}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
                        >
                          <Phone className="size-3" />
                          <span>{item.userPhone}</span>
                        </a>
                      )}
                    </div>

                    <div className="rounded-none bg-surface-sunken/50 p-3.5 text-sm font-medium text-ink leading-relaxed whitespace-pre-wrap">
                      {item.message}
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-ink-faint">
                      <Clock className="size-3.5" />
                      <span>
                        Received: {new Date(item.createdAt).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0 pt-2 sm:pt-0">
                    {item.status !== 'resolved' ? (
                      <Button
                        variant="primary"
                        size="md"
                        loading={actionId === item.id}
                        onClick={() => handleUpdateStatus(item.id, 'resolved')}
                        className="h-9 px-3 gap-1.5 text-xs font-bold"
                      >
                        <CheckCircle className="size-3.5" />
                        Mark Resolved
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        size="md"
                        loading={actionId === item.id}
                        onClick={() => handleUpdateStatus(item.id, 'new')}
                        className="h-9 px-3 text-xs"
                      >
                        Reopen
                      </Button>
                    )}

                    {item.status === 'new' && (
                      <Button
                        variant="secondary"
                        size="md"
                        loading={actionId === item.id}
                        onClick={() => handleUpdateStatus(item.id, 'reviewed')}
                        className="h-9 px-3 text-xs"
                      >
                        Mark Reviewed
                      </Button>
                    )}

                    <Button
                      variant="ghost"
                      size="icon"
                      loading={actionId === item.id}
                      onClick={() => handleDelete(item.id)}
                      className="size-9 text-danger hover:bg-danger-soft hover:text-danger text-xs"
                      aria-label="Delete report"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
