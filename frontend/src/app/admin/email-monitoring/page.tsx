'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertCircle,
  Mail,
  Send,
  XCircle,
  CheckCircle,
  Clock,
  Eye,
  RefreshCw,
  CheckCheck,
  Search
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface EmailStats {
  period: string;
  totalSent: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  recentFailures: Array<{
    id: string;
    email: string;
    emailType: string;
    statusMessage: string;
    sentAt: string;
  }>;
}

interface EmailLog {
  id: string;
  email: string;
  emailType: string;
  status: string;
  statusMessage?: string;
  sentAt: string;
  deliveredAt?: string;
  resendEmailId?: string;
  user?: {
    id: string;
    email: string;
    name?: string;
  };
}

interface UnverifiedUser {
  id: string;
  email: string;
  name?: string;
  createdAt: string;
  verificationTokenExpiry?: string;
  isExpired: boolean;
  lastEmailStatus: {
    status: string;
    statusMessage?: string;
    sentAt: string;
    resendEmailId?: string;
  } | null;
}

export default function EmailMonitoringPage() {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<EmailStats | null>(null);
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [unverifiedUsers, setUnverifiedUsers] = useState<UnverifiedUser[]>([]);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [emailSearch, setEmailSearch] = useState('');

  // Action states
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (token) {
      loadData();
    }
  }, [token]);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      const authToken = token?.startsWith('Bearer ') ? token : `Bearer ${token}`;
      const baseURL = process.env.NEXT_PUBLIC_API_URL;

      const [statsRes, logsRes, usersRes] = await Promise.all([
        axios.get(`${baseURL}/api/admin/email-stats`, {
          headers: { Authorization: authToken }
        }),
        axios.get(`${baseURL}/api/admin/email-logs?limit=50`, {
          headers: { Authorization: authToken }
        }),
        axios.get(`${baseURL}/api/admin/unverified-users`, {
          headers: { Authorization: authToken }
        })
      ]);

      setStats(statsRes.data);
      setLogs(logsRes.data.logs);
      setUnverifiedUsers(usersRes.data.users);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      setError(error?.response?.data?.error || 'Failed to load email monitoring data');
      console.error('Email monitoring load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async (userId: string) => {
    setActionLoading(userId);

    try {
      const authToken = token?.startsWith('Bearer ') ? token : `Bearer ${token}`;
      await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/admin/resend-verification`,
        { userId },
        { headers: { Authorization: authToken } }
      );

      alert('Verification email resent successfully!');
      loadData(); // Reload data
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      alert(error?.response?.data?.error || 'Failed to resend verification email');
    } finally {
      setActionLoading(null);
    }
  };

  const handleManualVerify = async (userId: string, email: string) => {
    if (!confirm(`Are you sure you want to manually verify ${email}? This will bypass email verification.`)) {
      return;
    }

    setActionLoading(userId);

    try {
      const authToken = token?.startsWith('Bearer ') ? token : `Bearer ${token}`;
      await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/api/admin/verify-user-manually`,
        { userId },
        { headers: { Authorization: authToken } }
      );

      alert('User verified successfully!');
      loadData(); // Reload data
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      alert(error?.response?.data?.error || 'Failed to verify user');
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'SENT':
        return <Send className="h-4 w-4 text-blue-500" />;
      case 'DELIVERED':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'FAILED':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'BOUNCED':
        return <AlertCircle className="h-4 w-4 text-orange-500" />;
      case 'OPENED':
        return <Eye className="h-4 w-4 text-purple-500" />;
      case 'PENDING':
        return <Clock className="h-4 w-4 text-gray-500" />;
      default:
        return <Mail className="h-4 w-4" />;
    }
  };

  const getStatusBadgeVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case 'SENT':
      case 'DELIVERED':
      case 'OPENED':
        return 'default';
      case 'FAILED':
      case 'BOUNCED':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  const filteredLogs = logs.filter(log => {
    if (statusFilter !== 'all' && log.status !== statusFilter) return false;
    if (typeFilter !== 'all' && log.emailType !== typeFilter) return false;
    if (emailSearch && !log.email.toLowerCase().includes(emailSearch.toLowerCase())) return false;
    return true;
  });

  const deliveryRate = stats
    ? ((stats.byStatus.DELIVERED || 0) + (stats.byStatus.SENT || 0)) / stats.totalSent * 100
    : 0;

  if (loading) {
    return (
      <div className="container max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-muted rounded w-1/3"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-muted rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-7xl mx-auto p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Email Monitoring</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track email delivery status and manage unverified users
          </p>
        </div>
        <Button onClick={loadData} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Emails
              </CardTitle>
              <Mail className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{stats.totalSent}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {stats.period}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Delivery Rate
              </CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {deliveryRate.toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {stats.byStatus.DELIVERED || 0} delivered
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Failed Emails
              </CardTitle>
              <XCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {stats.byStatus.FAILED || 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Requires attention
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Unverified Users
              </CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">
                {unverifiedUsers.length}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Pending verification
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Unverified Users Section */}
      {unverifiedUsers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center">
              <AlertCircle className="h-5 w-5 mr-2 text-orange-600" />
              Unverified Users ({unverifiedUsers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {unverifiedUsers.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-4 border border-border rounded-lg bg-muted/30"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-foreground">{user.email}</p>
                      {user.isExpired && (
                        <Badge variant="destructive" className="text-xs">
                          OTP Expired
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Signed up{' '}
                      {formatDistanceToNow(new Date(user.createdAt), { addSuffix: true })}
                    </p>
                    {user.lastEmailStatus && (
                      <div className="flex items-center gap-2 mt-2">
                        {getStatusIcon(user.lastEmailStatus.status)}
                        <span className="text-xs text-muted-foreground">
                          Last email: {user.lastEmailStatus.status} -{' '}
                          {formatDistanceToNow(new Date(user.lastEmailStatus.sentAt), {
                            addSuffix: true,
                          })}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleResendVerification(user.id)}
                      disabled={actionLoading === user.id}
                    >
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Resend
                    </Button>
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => handleManualVerify(user.id, user.email)}
                      disabled={actionLoading === user.id}
                    >
                      <CheckCheck className="h-3 w-3 mr-1" />
                      Verify
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Email Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center justify-between">
            <span className="flex items-center">
              <Mail className="h-5 w-5 mr-2" />
              Email Logs
            </span>
          </CardTitle>

          {/* Filters */}
          <div className="flex flex-wrap gap-3 mt-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by email..."
                value={emailSearch}
                onChange={(e) => setEmailSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="SENT">Sent</SelectItem>
                <SelectItem value="DELIVERED">Delivered</SelectItem>
                <SelectItem value="FAILED">Failed</SelectItem>
                <SelectItem value="BOUNCED">Bounced</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
              </SelectContent>
            </Select>

            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="VERIFICATION">Verification</SelectItem>
                <SelectItem value="PASSWORD_RESET">Password Reset</SelectItem>
                <SelectItem value="WELCOME">Welcome</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sent At</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No email logs found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-medium">{log.email}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {log.emailType.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getStatusIcon(log.status)}
                          <Badge variant={getStatusBadgeVariant(log.status)} className="text-xs">
                            {log.status}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(log.sentAt), { addSuffix: true })}
                      </TableCell>
                      <TableCell>
                        {log.statusMessage && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => alert(log.statusMessage)}
                            className="text-xs"
                          >
                            View Error
                          </Button>
                        )}
                        {log.resendEmailId && (
                          <span className="text-xs text-muted-foreground">
                            ID: {log.resendEmailId.substring(0, 8)}...
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {filteredLogs.length > 0 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                Showing {filteredLogs.length} of {logs.length} emails
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
