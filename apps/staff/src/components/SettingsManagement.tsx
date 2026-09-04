import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  Phone,
  Shield,
  Trash2,
  UserCheck,
  UserPlus,
  Users2,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { StoreSettings } from './StoreSettings';
import { Badge, Button, Card, CustomSelect, EmptyState, Skeleton, useToast } from './ui';

export type StaffAccount = {
  id: string;
  telegramUserId?: string | null;
  phoneNumber?: string | null;
  name: string;
  role: 'staff' | 'manager';
  isActive: boolean;
  isEnvAdmin?: boolean;
  createdAt: string;
};

export type SettingsSubTab = 'store' | 'users';

export interface SettingsManagementProps {
  subTab?: SettingsSubTab;
  onUsersCountChange?: (count: number) => void;
}

export function SettingsManagement({
  subTab = 'store',
  onUsersCountChange,
}: SettingsManagementProps) {
  const { toast } = useToast();

  // Staff accounts state
  const [staffAccounts, setStaffAccounts] = useState<StaffAccount[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [newStaffPhone, setNewStaffPhone] = useState('');
  const [newStaffId, setNewStaffId] = useState('');
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffRole, setNewStaffRole] = useState<'staff' | 'manager'>('staff');
  const [addingStaff, setAddingStaff] = useState(false);
  const [staffActionId, setStaffActionId] = useState<string | null>(null);
  const [addStaffOpen, setAddStaffOpen] = useState(false);

  const fetchStaffAccounts = useCallback(async () => {
    setLoadingStaff(true);
    try {
      const data = await apiFetch<StaffAccount[]>('/api/staff-accounts');
      setStaffAccounts(data);
      onUsersCountChange?.(data.length);
    } catch {
      toast({
        title: "Couldn't load users",
        variant: 'error',
      });
    } finally {
      setLoadingStaff(false);
    }
  }, [toast, onUsersCountChange]);

  useEffect(() => {
    fetchStaffAccounts();
  }, [fetchStaffAccounts]);

  const handleAddStaffAccount = async (e: FormEvent) => {
    e.preventDefault();
    const id = newStaffId.trim();
    const phone = newStaffPhone.trim();
    const name = newStaffName.trim();

    if (!name) {
      toast({ title: 'Please enter staff or manager name.', variant: 'error' });
      return;
    }
    if (!phone && !id) {
      toast({ title: 'Please provide either a Phone Number or Telegram User ID.', variant: 'error' });
      return;
    }
    if (id && !/^\d+$/.test(id)) {
      toast({ title: 'Telegram User ID must be numeric.', variant: 'error' });
      return;
    }

    setAddingStaff(true);
    try {
      const created = await apiFetch<StaffAccount>('/api/staff-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: phone || undefined,
          telegramUserId: id || undefined,
          name,
          role: newStaffRole,
        }),
      });
      setStaffAccounts((prev) => {
        const filtered = prev.filter((a) => a.id !== created.id && (!created.phoneNumber || a.phoneNumber !== created.phoneNumber));
        const updated = [created, ...filtered];
        onUsersCountChange?.(updated.length);
        return updated;
      });
      toast({ title: `Added ${name} (${newStaffRole})`, variant: 'success' });
      setNewStaffId('');
      setNewStaffPhone('');
      setNewStaffName('');
      setNewStaffRole('staff');
      setAddStaffOpen(false);
    } catch (err: any) {
      toast({ title: "Couldn't add user", description: err.message, variant: 'error' });
    } finally {
      setAddingStaff(false);
    }
  };

  const handleToggleStaffStatus = async (account: StaffAccount) => {
    if (account.isEnvAdmin) return;
    setStaffActionId(account.id);
    try {
      const updated = await apiFetch<StaffAccount>(`/api/staff-accounts/${account.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !account.isActive }),
      });
      setStaffAccounts((prev) => prev.map((a) => (a.id === account.id ? updated : a)));
      toast({
        title: updated.isActive ? 'Account activated' : 'Account deactivated',
        variant: 'info',
      });
    } catch {
      toast({ title: "Couldn't update status", variant: 'error' });
    } finally {
      setStaffActionId(null);
    }
  };

  const handleDeleteStaffAccount = async (account: StaffAccount) => {
    if (account.isEnvAdmin) return;
    setStaffActionId(account.id);
    try {
      await apiFetch(`/api/staff-accounts/${account.id}`, { method: 'DELETE' });
      setStaffAccounts((prev) => {
        const filtered = prev.filter((a) => a.id !== account.id);
        onUsersCountChange?.(filtered.length);
        return filtered;
      });
      toast({ title: `Removed ${account.name}`, variant: 'info' });
    } catch {
      toast({ title: "Couldn't remove user", variant: 'error' });
    } finally {
      setStaffActionId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {subTab === 'store' ? (
        <StoreSettings />
      ) : (
        <div className="space-y-6">
          {/* Header + Add Action */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-ink">Users</h3>
              <p className="text-xs text-ink-soft">
                Manage staff and manager accounts authorized to log into the staff portal.
              </p>
            </div>
            <Button
              variant={addStaffOpen ? 'secondary' : 'primary'}
              size="md"
              onClick={() => setAddStaffOpen(!addStaffOpen)}
              className="gap-2 font-bold"
            >
              {addStaffOpen ? (
                <>
                  <X className="size-4" />
                  Close Form
                </>
              ) : (
                <>
                  <UserPlus className="size-4" />
                  Add User
                </>
              )}
            </Button>
          </div>

          {/* Add Account Drawer / Form */}
          {addStaffOpen && (
            <Card padding="lg" className="border-accent/40 bg-surface shadow-md">
              <form onSubmit={handleAddStaffAccount} className="space-y-4">
                <div className="flex items-center gap-2 font-bold text-ink">
                  <UserPlus className="size-5 text-accent" />
                  <span>Authorize New User</span>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <label className="block text-xs font-bold text-ink mb-1">
                      Name <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Sok Dara (Barista)"
                      value={newStaffName}
                      onChange={(e) => setNewStaffName(e.target.value)}
                      className="h-11 w-full rounded-none border border-border bg-surface px-3 text-sm font-bold text-ink outline-none focus:border-accent"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-ink mb-1">
                      Phone Number (for SMS OTP)
                    </label>
                    <input
                      type="tel"
                      inputMode="tel"
                      placeholder="e.g. 012 345 678"
                      value={newStaffPhone}
                      onChange={(e) => setNewStaffPhone(e.target.value)}
                      className="h-11 w-full rounded-none border border-border bg-surface px-3 text-sm font-bold text-ink outline-none focus:border-accent"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-ink mb-1">
                      Telegram ID (Optional)
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="e.g. 715714775"
                      value={newStaffId}
                      onChange={(e) => setNewStaffId(e.target.value)}
                      className="h-11 w-full rounded-none border border-border bg-surface px-3 font-mono text-sm font-bold text-ink outline-none focus:border-accent"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-ink mb-1">
                      Assigned Role
                    </label>
                    <CustomSelect<'staff' | 'manager'>
                      value={newStaffRole}
                      onChange={(val) => setNewStaffRole(val)}
                      options={[
                        { value: 'staff', label: 'Staff (Orders & Stock)' },
                        { value: 'manager', label: 'Manager (Full Access + Reports)' },
                      ]}
                      size="lg"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-border">
                  <Button
                    type="button"
                    variant="ghost"
                    size="md"
                    onClick={() => setAddStaffOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    loading={addingStaff}
                    className="font-bold"
                  >
                    Save &amp; Grant Access
                  </Button>
                </div>
              </form>
            </Card>
          )}

          {/* Staff Accounts List */}
          {loadingStaff ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full rounded-none" />
              <Skeleton className="h-20 w-full rounded-none" />
            </div>
          ) : staffAccounts.length === 0 ? (
            <EmptyState
              icon={<Users2 className="size-10" />}
              title="No Users Configured"
              description="Click 'Add User' to allow team members to log in."
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {staffAccounts.map((account) => {
                const isManager = account.role === 'manager';
                return (
                  <Card
                    key={account.id}
                    padding="md"
                    className={`flex flex-col justify-between transition-all ${
                      account.isActive
                        ? 'border-border bg-surface shadow-xs'
                        : 'border-border/60 bg-surface-sunken/40 opacity-70'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div
                            className={`flex size-8 items-center justify-center rounded-none ${
                              isManager
                                ? 'bg-accent/15 text-accent'
                                : 'bg-surface-sunken text-ink-soft'
                            }`}
                          >
                            {isManager ? <Shield className="size-4" /> : <UserCheck className="size-4" />}
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-ink">{account.name}</h4>
                            <div className="flex flex-col gap-0.5 mt-0.5">
                              {account.phoneNumber && (
                                <p className="font-mono text-[11px] text-ink-soft flex items-center gap-1">
                                  <Phone className="size-3 text-accent" />
                                  {account.phoneNumber}
                                </p>
                              )}
                              {account.telegramUserId && (
                                <p className="font-mono text-[11px] text-ink-faint">
                                  {account.isEnvAdmin
                                    ? 'TG: Protected Admin'
                                    : `TG: •••• ${account.telegramUserId.slice(-4)}`}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1">
                          <span
                            className={`rounded-none px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                              isManager
                                ? 'bg-accent text-on-accent'
                                : 'bg-surface-sunken text-ink-soft'
                            }`}
                          >
                            {account.isEnvAdmin ? 'Admin' : account.role}
                          </span>
                        </div>
                      </div>
                    </div>

                    {!account.isEnvAdmin ? (
                      <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                        <Button
                          variant={account.isActive ? 'ghost' : 'success'}
                          size="md"
                          loading={staffActionId === account.id}
                          onClick={() => handleToggleStaffStatus(account)}
                          className="text-xs"
                        >
                          {account.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
                        <Button
                          variant="danger"
                          size="md"
                          loading={staffActionId === account.id}
                          onClick={() => handleDeleteStaffAccount(account)}
                          className="text-xs gap-1"
                        >
                          <Trash2 className="size-3.5" />
                          Remove
                        </Button>
                      </div>
                    ) : (
                      <div className="mt-4 flex items-center justify-between border-t border-border pt-2 text-[11px] text-ink-soft font-semibold">
                        <span>Primary Admin</span>
                        <Badge variant="ready" dot>Active</Badge>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
