'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import axios from 'axios';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertCircle, Trash2, AlertTriangle, Search } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

interface User {
  id: string;
  email: string;
  role: string;
  createdAt: string;
  strategiesOwned: number;
  subscriptions: number;
}

interface DeletionImpact {
  email: string;
  role: string;
  willDelete: {
    activeSubscriptions: number;
    brokerCredentials: number;
    apiKeys: number;
    reviews: number;
  };
  willUnassign: {
    strategies: Array<{
      name: string;
      code: string;
      activeSubscribers: number;
    }>;
  };
  activeSubscriptionDetails: Array<{
    strategyName: string;
    strategyCode: string;
  }>;
}

export default function AdminUsersPage() {
  const { token, user: currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [confirmEmail, setConfirmEmail] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deletionImpact, setDeletionImpact] = useState<DeletionImpact | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');

  // Filter users based on search term
  const filteredUsers = users.filter(user =>
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Calculate pagination
  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  useEffect(() => {
    loadUsers();
  }, [token]);

  const loadUsers = async () => {
    if (!token) return;

    setLoading(true);
    setError(null);

    try {
      const authToken = token.startsWith('Bearer ') ? token : `Bearer ${token}`;

      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/users`, {
        headers: { Authorization: authToken }
      });

      setUsers(response.data.users);
    } catch (err) {
      const error = err as { response?: { data?: { error?: string } } };
      setError(error?.response?.data?.error || 'Failed to load users');
      console.error('Users load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateUserRole = async (userId: string, newRole: string) => {
    if (!token) return;

    try {
      const authToken = token.startsWith('Bearer ') ? token : `Bearer ${token}`;

      await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/api/admin/users/${userId}/role`,
        { role: newRole },
        { headers: { Authorization: authToken } }
      );

      // Reload users
      loadUsers();
    } catch (err) {
      const error = err as { response?: { data?: { error?: string } } };
      setError(error?.response?.data?.error || 'Failed to update user role');
    }
  };

  const handleDeleteClick = (user: User) => {
    setUserToDelete(user);
    setConfirmEmail('');
    setDeletionImpact(null);
    setDeleting(false); // Reset deleting state when opening new dialog
    setError(null); // Clear any previous errors
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!token || !userToDelete || confirmEmail !== userToDelete.email) return;

    setDeleting(true);
    setError(null);

    try {
      const authToken = token.startsWith('Bearer ') ? token : `Bearer ${token}`;

      const response = await axios.delete(
        `${process.env.NEXT_PUBLIC_API_URL}/api/admin/users/${userToDelete.id}`,
        { headers: { Authorization: authToken } }
      );

      setDeletionImpact(response.data.deletionImpact);

      // Wait 3 seconds to show the impact, then reload users
      setTimeout(() => {
        setDeleteDialogOpen(false);
        setUserToDelete(null);
        setConfirmEmail('');
        setDeletionImpact(null);
        setDeleting(false); // Reset deleting state
        loadUsers();
      }, 3000);
    } catch (err) {
      const error = err as { response?: { data?: { error?: string } } };
      setError(error?.response?.data?.error || 'Failed to delete user');
      setDeleting(false);
    }
  };

  const isCurrentUser = (userId: string) => {
    return currentUser?.id === userId;
  };

  if (loading) {
    return (
      <div className="container max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-muted rounded w-1/3"></div>
          <div className="h-32 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-7xl mx-auto p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">User Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage user roles and permissions
          </p>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle>Platform Users ({users.length})</CardTitle>
          <CardDescription>
            View and manage user roles across the platform (Page {currentPage} of {totalPages || 1})
          </CardDescription>

          {/* Search Bar */}
          <div className="relative mt-4">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by email..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1); // Reset to first page when searching
              }}
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent>
          {filteredUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              {searchTerm ? `No users found matching "${searchTerm}"` : 'No users found in the platform.'}
            </p>
          ) : users.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No users found in the platform.
            </p>
          ) : (
            <div className="space-y-4">
              {paginatedUsers.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-4 border border-border rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <p className="font-medium text-foreground">{user.email}</p>
                      <Badge variant={user.role === 'ADMIN' ? 'default' : 'secondary'}>
                        {user.role}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Strategies: {user.strategiesOwned} • Subscriptions: {user.subscriptions}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Joined: {new Date(user.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <select
                      className="px-3 py-1.5 text-sm border border-border rounded-md bg-background"
                      value={user.role}
                      onChange={(e) => updateUserRole(user.id, e.target.value)}
                    >
                      <option value="REGULAR">REGULAR</option>
                      <option value="QUANT">QUANT</option>
                      <option value="CLIENT">CLIENT</option>
                      <option value="ADMIN">ADMIN</option>
                    </select>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDeleteClick(user)}
                      disabled={isCurrentUser(user.id)}
                      title={isCurrentUser(user.id) ? 'Cannot delete your own account' : 'Delete user'}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}

              {/* Pagination */}
              {filteredUsers.length > itemsPerPage && (
                <Pagination className="mt-6">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          if (currentPage > 1) setCurrentPage(currentPage - 1);
                        }}
                        className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                      />
                    </PaginationItem>

                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                      if (
                        page === 1 ||
                        page === totalPages ||
                        (page >= currentPage - 1 && page <= currentPage + 1)
                      ) {
                        return (
                          <PaginationItem key={page}>
                            <PaginationLink
                              href="#"
                              onClick={(e) => {
                                e.preventDefault();
                                setCurrentPage(page);
                              }}
                              isActive={currentPage === page}
                              className="cursor-pointer"
                            >
                              {page}
                            </PaginationLink>
                          </PaginationItem>
                        );
                      }
                      if (page === currentPage - 2 || page === currentPage + 2) {
                        return (
                          <PaginationItem key={page}>
                            <PaginationEllipsis />
                          </PaginationItem>
                        );
                      }
                      return null;
                    })}

                    <PaginationItem>
                      <PaginationNext
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          if (currentPage < totalPages) setCurrentPage(currentPage + 1);
                        }}
                        className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Delete User Account
            </DialogTitle>
            <DialogDescription>
              This action is permanent and cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {deletionImpact ? (
            // Success state - show what was deleted
            <div className="space-y-4 py-4">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>User Deleted Successfully</AlertTitle>
                <AlertDescription>
                  <strong>{deletionImpact.email}</strong> ({deletionImpact.role}) has been removed from the platform.
                </AlertDescription>
              </Alert>

              <div className="bg-muted p-4 rounded-lg space-y-3 text-sm">
                <p className="font-semibold">Deletion Summary:</p>
                <ul className="space-y-1 list-disc list-inside">
                  <li>Active subscriptions terminated: {deletionImpact.willDelete.activeSubscriptions}</li>
                  <li>Broker credentials deleted: {deletionImpact.willDelete.brokerCredentials}</li>
                  <li>API keys deleted: {deletionImpact.willDelete.apiKeys}</li>
                  <li>Reviews deleted: {deletionImpact.willDelete.reviews}</li>
                  {deletionImpact.willUnassign.strategies.length > 0 && (
                    <li>
                      Strategies unassigned: {deletionImpact.willUnassign.strategies.length}
                      <ul className="ml-6 mt-1 text-xs text-muted-foreground">
                        {deletionImpact.willUnassign.strategies.map((s, i) => (
                          <li key={i}>
                            {s.name} ({s.code}) - {s.activeSubscribers} active subscribers
                          </li>
                        ))}
                      </ul>
                    </li>
                  )}
                </ul>
              </div>

              <p className="text-sm text-muted-foreground">
                This dialog will close automatically...
              </p>
            </div>
          ) : (
            // Confirmation state
            <div className="space-y-4 py-4">
              {userToDelete && (
                <>
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Warning: Irreversible Action</AlertTitle>
                    <AlertDescription>
                      You are about to delete <strong>{userToDelete.email}</strong> ({userToDelete.role})
                    </AlertDescription>
                  </Alert>

                  <div className="bg-muted p-4 rounded-lg space-y-3 text-sm">
                    <p className="font-semibold">This will permanently delete:</p>
                    <ul className="space-y-1 list-disc list-inside">
                      <li>User account and authentication data</li>
                      <li>All active subscriptions ({userToDelete.subscriptions}) and related trades</li>
                      <li>All broker credentials and API keys</li>
                      <li>All reviews and ratings</li>
                      <li>All invite links created by this user</li>
                    </ul>

                    {userToDelete.strategiesOwned > 0 && (
                      <div className="mt-3 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded">
                        <p className="font-semibold text-yellow-600 dark:text-yellow-500 flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4" />
                          Strategy Ownership Warning
                        </p>
                        <p className="text-xs mt-1">
                          This user owns <strong>{userToDelete.strategiesOwned} strategy(ies)</strong>.
                          These strategies will become unassigned but remain in the system.
                          Their active subscribers will continue to run.
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium">
                      To confirm deletion, type the user&apos;s email address:
                    </p>
                    <Input
                      type="text"
                      placeholder={userToDelete.email}
                      value={confirmEmail}
                      onChange={(e) => setConfirmEmail(e.target.value)}
                      className="font-mono"
                      disabled={deleting}
                    />
                  </div>

                  {error && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Error</AlertTitle>
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
                </>
              )}
            </div>
          )}

          <DialogFooter>
            {!deletionImpact && (
              <>
                <Button
                  variant="outline"
                  onClick={() => setDeleteDialogOpen(false)}
                  disabled={deleting}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDeleteConfirm}
                  disabled={!userToDelete || confirmEmail !== userToDelete.email || deleting}
                >
                  {deleting ? 'Deleting...' : 'Delete User Permanently'}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
