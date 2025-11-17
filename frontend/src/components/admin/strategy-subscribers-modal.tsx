'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Save, X, RefreshCw, AlertCircle } from 'lucide-react';

interface Subscriber {
  id: string;
  user: {
    id: string;
    email: string;
    name: string | null;
  };
  settings: {
    capital: number;
    riskPerTrade: number | null;
    leverage: number | null;
    maxPositions: number | null;
    maxDailyLoss: number | null;
  };
  effectiveSettings: {
    riskPerTrade: number;
    leverage: number;
    maxPositions: number;
    maxDailyLoss: number;
  };
  usingDefaults: {
    riskPerTrade: boolean;
    leverage: boolean;
    maxPositions: boolean;
    maxDailyLoss: boolean;
  };
  tradingType: string;
  marginCurrency: string;
  isPaused: boolean;
  subscribedAt: string;
  stats: {
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    totalPnl: number;
  };
}

interface SubscriberData {
  strategy: {
    id: string;
    name: string;
    defaults: {
      riskPerTrade: number;
      leverage: number;
      maxPositions: number;
      maxDailyLoss: number;
    };
  };
  subscribers: Subscriber[];
  count: number;
}

interface StrategySubscribersModalProps {
  open: boolean;
  onClose: () => void;
  strategyId: string;
  strategyName: string;
  token: string;
}

export function StrategySubscribersModal({
  open,
  onClose,
  strategyId,
  strategyName,
  token,
}: StrategySubscribersModalProps) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SubscriberData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<any>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkField, setBulkField] = useState<'riskPerTrade' | 'leverage' | 'maxPositions' | 'maxDailyLoss'>('riskPerTrade');
  const [bulkValue, setBulkValue] = useState('');

  useEffect(() => {
    if (open) {
      loadSubscribers();
    }
  }, [open, strategyId]);

  const loadSubscribers = async () => {
    setLoading(true);
    setError(null);
    try {
      const authToken = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
      const res = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/api/admin/strategies/${strategyId}/subscribers`,
        { headers: { Authorization: authToken } }
      );
      setData(res.data);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load subscribers');
      console.error('Load subscribers error:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateSubscriber = async (subscriptionId: string) => {
    try {
      const authToken = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
      await axios.patch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/admin/strategies/${strategyId}/subscribers/${subscriptionId}`,
        editValues,
        { headers: { Authorization: authToken } }
      );
      await loadSubscribers();
      setEditingId(null);
      setEditValues({});
      setError(null);
    } catch (err: any) {
      const errorMsg = err?.response?.data?.details?.join(', ') || err?.response?.data?.error || 'Failed to update';
      setError(errorMsg);
    }
  };

  const bulkUpdate = async (resetToDefaults: boolean = false) => {
    if (selectedIds.size === 0) return;

    const confirmed = window.confirm(
      resetToDefaults
        ? `Reset to strategy defaults for ${selectedIds.size} subscriber(s)?`
        : `Set ${bulkField} to ${bulkValue} for ${selectedIds.size} subscriber(s)?`
    );

    if (!confirmed) return;

    try {
      const authToken = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
      await axios.patch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/admin/strategies/${strategyId}/subscribers/bulk`,
        {
          subscriptionIds: Array.from(selectedIds),
          resetToDefaults,
          updates: resetToDefaults ? {} : { [bulkField]: parseFloat(bulkValue) || null }
        },
        { headers: { Authorization: authToken } }
      );
      await loadSubscribers();
      setSelectedIds(new Set());
      setBulkValue('');
      setError(null);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to bulk update');
    }
  };

  const startEdit = (sub: Subscriber) => {
    setEditingId(sub.id);
    setEditValues({
      riskPerTrade: sub.settings.riskPerTrade,
      leverage: sub.settings.leverage,
      maxPositions: sub.settings.maxPositions,
      maxDailyLoss: sub.settings.maxDailyLoss,
      capital: sub.settings.capital,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValues({});
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const toggleSelectAll = () => {
    if (!data) return;
    if (selectedIds.size === data.subscribers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(data.subscribers.map(s => s.id)));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">
            Manage Subscribers - {strategyName}
          </DialogTitle>
          <DialogDescription>
            {data && (
              <div className="mt-2 space-y-1">
                <div>Total Subscribers: {data.count}</div>
                <div className="text-xs">
                  Strategy Defaults - Risk: {(data.strategy.defaults.riskPerTrade * 100).toFixed(1)}%,
                  Leverage: {data.strategy.defaults.leverage}x,
                  Max Positions: {data.strategy.defaults.maxPositions},
                  Max Daily Loss: {(data.strategy.defaults.maxDailyLoss * 100).toFixed(1)}%
                </div>
              </div>
            )}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Bulk Actions */}
        {data && data.subscribers.length > 0 && (
          <div className="border rounded-lg p-4 space-y-3 bg-muted/50">
            <div className="flex items-center gap-4">
              <Label className="font-semibold">Bulk Actions:</Label>
              <span className="text-sm text-muted-foreground">
                {selectedIds.size} selected
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={toggleSelectAll}
              >
                {selectedIds.size === data.subscribers.length ? 'Deselect All' : 'Select All'}
              </Button>
            </div>

            {selectedIds.size > 0 && (
              <div className="flex items-end gap-3">
                <div className="flex-1 space-y-2">
                  <Label htmlFor="bulk-field">Field</Label>
                  <select
                    id="bulk-field"
                    className="w-full px-3 py-2 border rounded-md bg-background"
                    value={bulkField}
                    onChange={(e) => setBulkField(e.target.value as any)}
                  >
                    <option value="riskPerTrade">Risk Per Trade</option>
                    <option value="leverage">Leverage</option>
                    <option value="maxPositions">Max Positions</option>
                    <option value="maxDailyLoss">Max Daily Loss</option>
                  </select>
                </div>

                <div className="flex-1 space-y-2">
                  <Label htmlFor="bulk-value">Value (leave empty for NULL/default)</Label>
                  <Input
                    id="bulk-value"
                    type="number"
                    step="0.01"
                    value={bulkValue}
                    onChange={(e) => setBulkValue(e.target.value)}
                    placeholder="e.g., 0.1 for 10%"
                  />
                </div>

                <Button onClick={() => bulkUpdate(false)}>
                  Apply to Selected
                </Button>
                <Button
                  variant="outline"
                  onClick={() => bulkUpdate(true)}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Reset to Defaults
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Subscribers Table */}
        {loading ? (
          <div className="py-8 text-center text-muted-foreground">
            Loading subscribers...
          </div>
        ) : !data || data.subscribers.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            No active subscribers found.
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={selectedIds.size === data.subscribers.length && data.subscribers.length > 0}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Capital</TableHead>
                  <TableHead>Risk/Trade</TableHead>
                  <TableHead>Leverage</TableHead>
                  <TableHead>Max Pos</TableHead>
                  <TableHead>Max Loss</TableHead>
                  <TableHead>Stats</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.subscribers.map((sub) => {
                  const isEditing = editingId === sub.id;
                  return (
                    <TableRow key={sub.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(sub.id)}
                          onCheckedChange={() => toggleSelect(sub.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{sub.user.email}</div>
                          {sub.user.name && (
                            <div className="text-xs text-muted-foreground">{sub.user.name}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Input
                            type="number"
                            className="w-24"
                            value={editValues.capital}
                            onChange={(e) => setEditValues({ ...editValues, capital: parseFloat(e.target.value) })}
                          />
                        ) : (
                          <span>₹{sub.settings.capital.toLocaleString()}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Input
                            type="number"
                            step="0.01"
                            className="w-24"
                            placeholder="NULL"
                            value={editValues.riskPerTrade ?? ''}
                            onChange={(e) => setEditValues({
                              ...editValues,
                              riskPerTrade: e.target.value ? parseFloat(e.target.value) : null
                            })}
                          />
                        ) : (
                          <div>
                            <div>{(sub.effectiveSettings.riskPerTrade * 100).toFixed(1)}%</div>
                            {sub.usingDefaults.riskPerTrade && (
                              <Badge variant="secondary" className="text-xs mt-1">Default</Badge>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Input
                            type="number"
                            className="w-20"
                            placeholder="NULL"
                            value={editValues.leverage ?? ''}
                            onChange={(e) => setEditValues({
                              ...editValues,
                              leverage: e.target.value ? parseInt(e.target.value) : null
                            })}
                          />
                        ) : (
                          <div>
                            <div>{sub.effectiveSettings.leverage}x</div>
                            {sub.usingDefaults.leverage && (
                              <Badge variant="secondary" className="text-xs mt-1">Default</Badge>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Input
                            type="number"
                            className="w-20"
                            placeholder="NULL"
                            value={editValues.maxPositions ?? ''}
                            onChange={(e) => setEditValues({
                              ...editValues,
                              maxPositions: e.target.value ? parseInt(e.target.value) : null
                            })}
                          />
                        ) : (
                          <div>
                            <div>{sub.effectiveSettings.maxPositions}</div>
                            {sub.usingDefaults.maxPositions && (
                              <Badge variant="secondary" className="text-xs mt-1">Default</Badge>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Input
                            type="number"
                            step="0.01"
                            className="w-24"
                            placeholder="NULL"
                            value={editValues.maxDailyLoss ?? ''}
                            onChange={(e) => setEditValues({
                              ...editValues,
                              maxDailyLoss: e.target.value ? parseFloat(e.target.value) : null
                            })}
                          />
                        ) : (
                          <div>
                            <div>{(sub.effectiveSettings.maxDailyLoss * 100).toFixed(1)}%</div>
                            {sub.usingDefaults.maxDailyLoss && (
                              <Badge variant="secondary" className="text-xs mt-1">Default</Badge>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-xs space-y-1">
                          <div>Trades: {sub.stats.totalTrades}</div>
                          <div className={sub.stats.totalPnl >= 0 ? 'text-green-600' : 'text-red-600'}>
                            PnL: ₹{sub.stats.totalPnl.toFixed(2)}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {isEditing ? (
                          <div className="flex justify-end gap-2">
                            <Button size="sm" onClick={() => updateSubscriber(sub.id)}>
                              <Save className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={cancelEdit}>
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => startEdit(sub)}>
                            Edit
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
