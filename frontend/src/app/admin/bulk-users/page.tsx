'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Check, X, AlertCircle, Loader2, Trash2, Plus, Save, Settings2, Eraser, UserCog, Zap } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { toast } from 'sonner';

interface BulkUser {
  id: string;
  email: string;
  name: string;
  password: string;
  phoneNumber: string;
  role: string;
  apiKey: string;
  apiSecret: string;
  errors?: Record<string, string>;
  validationStatus?: {
    emailExists?: boolean;
    credentialsValid?: boolean | null;
  };
}

interface BulkUserResult {
  email: string;
  status: 'success' | 'failed';
  userId?: string;
  credentialsStored: boolean;
  credentialValidation?: 'valid' | 'invalid' | 'skipped' | 'error';
  error?: string;
}

type FieldType = 'email' | 'name' | 'password' | 'phoneNumber' | 'role' | 'apiKey' | 'apiSecret' | 'ignore';

const FIELD_LABELS: Record<FieldType, string> = {
  email: 'Email',
  name: 'Name',
  password: 'Password',
  phoneNumber: 'Phone',
  role: 'Role',
  apiKey: 'API Key',
  apiSecret: 'API Secret',
  ignore: 'Ignore Column',
};

export default function BulkUsersPage() {
  const [parsedUsers, setParsedUsers] = useState<BulkUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [results, setResults] = useState<{
    summary?: {
      total: number;
      successful: number;
      failed: number;
      credentialsStored: number;
      credentialsInvalid: number;
      credentialsSkipped: number;
    };
    results?: BulkUserResult[];
  } | null>(null);
  const [error, setError] = useState<string>('');

  // Paste & Mapping State
  const [isMappingDialogOpen, setIsMappingDialogOpen] = useState(false);
  const [rawImportData, setRawImportData] = useState<string[][]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<number, FieldType>>({});

  // Initialize with empty rows if empty
  useEffect(() => {
    if (parsedUsers.length === 0 && !results) {
      // Add 10 empty rows to start with, to look like a sheet
      const emptyRows = Array(10).fill(null).map(() => createEmptyUser());
      setParsedUsers(emptyRows);
    }
  }, [parsedUsers.length, results]);

  const createEmptyUser = (): BulkUser => ({
    id: crypto.randomUUID(),
    email: '',
    name: '',
    password: '',
    phoneNumber: '',
    role: 'REGULAR',
    apiKey: '',
    apiSecret: '',
  });

  const parseRawData = (content: string): string[][] => {
    const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length === 0) return [];

    // Detect delimiter
    const firstLine = lines[0];
    const isTabSeparated = firstLine.includes('\t');
    const delimiter = isTabSeparated ? '\t' : ',';

    return lines.map(line => {
      if (delimiter === ',') {
        const matches = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
        return matches ? matches.map(m => m.replace(/^"|"$/g, '').trim()) : line.split(',').map(p => p.trim());
      } else {
        return line.split(delimiter).map(p => p.trim());
      }
    });
  };

  const guessColumnMapping = (headers: string[]): Record<number, FieldType> => {
    const mapping: Record<number, FieldType> = {};

    headers.forEach((header, index) => {
      const h = header.toLowerCase();
      if (h.includes('email')) mapping[index] = 'email';
      else if (h.includes('name')) mapping[index] = 'name';
      else if (h.includes('pass')) mapping[index] = 'password';
      else if (h.includes('phone') || h.includes('mobile')) mapping[index] = 'phoneNumber';
      else if (h.includes('role')) mapping[index] = 'role';
      else if (h.includes('key') || h.includes('api')) mapping[index] = 'apiKey';
      else if (h.includes('secret')) mapping[index] = 'apiSecret';
      else mapping[index] = 'ignore';
    });

    return mapping;
  };

  const handleRawPaste = (text: string) => {
    const data = parseRawData(text);
    if (data.length === 0) return;

    setRawImportData(data);
    const initialMapping = guessColumnMapping(data[0]);
    setColumnMapping(initialMapping);
    setIsMappingDialogOpen(true);
  };

  // Global Paste Handler
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      // Only handle paste if not inside an input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      const text = e.clipboardData?.getData('text');
      if (text) {
        e.preventDefault();
        handleRawPaste(text);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [handleRawPaste]);

  const validateUser = (user: BulkUser): Record<string, string> => {
    const errors: Record<string, string> = {};

    // Skip validation for completely empty rows (they are just placeholders)
    if (!user.email && !user.name && !user.password && !user.apiKey) return {};

    if (!user.email) errors.email = 'Required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email)) errors.email = 'Invalid format';

    if (!user.name) errors.name = 'Required';
    if (!user.password) errors.password = 'Required';

    if ((user.apiKey && !user.apiSecret) || (!user.apiKey && user.apiSecret)) {
      errors.apiKey = 'Pair required';
      errors.apiSecret = 'Pair required';
    }

    return errors;
  };

  // Re-validate all users when list changes
  useEffect(() => {
    if (parsedUsers.length > 0) {
      const updatedUsers = parsedUsers.map(user => ({
        ...user,
        errors: validateUser(user)
      }));

      // Deep comparison to avoid infinite loop
      const hasChanges = updatedUsers.some((u, i) =>
        JSON.stringify(u.errors) !== JSON.stringify(parsedUsers[i].errors)
      );

      if (hasChanges) {
        setParsedUsers(updatedUsers);
      }
    }
  }, [parsedUsers]);

  const handleImportConfirm = () => {
    const dataRows = rawImportData;

    const newUsers: BulkUser[] = dataRows.map(row => {
      const user: Partial<BulkUser> = {
        id: crypto.randomUUID(),
        role: 'REGULAR',
        email: '', name: '', password: '', phoneNumber: '', apiKey: '', apiSecret: ''
      };

      Object.entries(columnMapping).forEach(([colIndex, field]) => {
        if (field !== 'ignore' && row[parseInt(colIndex)]) {
          user[field] = row[parseInt(colIndex)];
        }
      });

      return { ...user, errors: {} } as BulkUser;
    });

    // Filter out empty rows from import
    const validNewUsers = newUsers.filter(u => u.email || u.name || u.password);

    // Replace empty placeholder rows if we are just starting, otherwise append
    setParsedUsers(prev => {
      const hasRealData = prev.some(u => u.email || u.name);
      if (!hasRealData) {
        return validNewUsers;
      }
      return [...prev.filter(u => u.email || u.name), ...validNewUsers];
    });

    setIsMappingDialogOpen(false);
    setRawImportData([]);
    toast.success(`Imported ${validNewUsers.length} rows`);
  };

  const handleUpdateUser = (id: string, field: keyof BulkUser, value: string) => {
    setParsedUsers(prev => prev.map(user => {
      if (user.id === id) {
        return { ...user, [field]: value };
      }
      return user;
    }));
  };

  const handleDeleteUser = (id: string) => {
    setParsedUsers(prev => prev.filter(user => user.id !== id));
  };

  const handleAddUser = () => {
    setParsedUsers(prev => [...prev, createEmptyUser()]);
  };

  // Bulk Actions
  const handleBulkSetRole = (role: string) => {
    setParsedUsers(prev => prev.map(u => u.email ? ({ ...u, role }) : u));
  };

  const handleRemoveInvalid = () => {
    setParsedUsers(prev => prev.filter(u => {
      // Keep empty rows
      if (!u.email && !u.name) return true;
      // Remove rows with errors
      return !u.errors || Object.keys(u.errors).length === 0;
    }));
  };

  const handleClearInvalidCredentials = () => {
    setParsedUsers(prev => prev.map(u => {
      if (u.validationStatus?.credentialsValid === false) {
        return { ...u, apiKey: '', apiSecret: '', validationStatus: { ...u.validationStatus, credentialsValid: null } };
      }
      return u;
    }));
    toast.success('Cleared invalid credentials');
  };

  const handleRemoveExistingUsers = () => {
    setParsedUsers(prev => prev.filter(u => !u.validationStatus?.emailExists));
    toast.success('Removed existing users');
  };

  const handleClearAll = () => {
    setParsedUsers([createEmptyUser()]); // Reset to one empty row
    setResults(null);
    setError('');
  };

  const handleTestConnections = async () => {
    const usersToTest = parsedUsers.filter(u => u.email); // Only test rows with data
    if (usersToTest.length === 0) return;

    setIsValidating(true);
    try {
      const response = await fetch('/api/admin/users/validate-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          users: usersToTest.map(u => ({ email: u.email, apiKey: u.apiKey, apiSecret: u.apiSecret }))
        }),
      });

      if (!response.ok) throw new Error('Validation failed');

      const { results } = await response.json();

      setParsedUsers(prev => prev.map(user => {
        const result = results.find((r: BulkUserResult) => r.email === user.email);
        if (result) {
          return {
            ...user,
            validationStatus: {
              emailExists: result.emailExists,
              credentialsValid: result.credentialsValid
            }
          };
        }
        return user;
      }));

      toast.success('Validation complete');
    } catch (_err) {
      toast.error('Failed to validate users');
    } finally {
      setIsValidating(false);
    }
  };

  const handleBulkCreate = async () => {
    const usersToSend = parsedUsers
      .filter(u => u.email && u.name && u.password) // Only send complete rows
      .map(({ id: __id, errors: __errors, validationStatus: __vs, ...user }) => ({
        ...user,
        phoneNumber: user.phoneNumber || undefined,
        apiKey: user.apiKey || undefined,
        apiSecret: user.apiSecret || undefined,
      }));

    if (usersToSend.length === 0) {
      setError('No valid users to create');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/admin/users/bulk-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ users: usersToSend }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create users');
      }

      const data = await response.json();
      setResults(data);
      setParsedUsers([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusBadge = (status: 'success' | 'failed') => {
    if (status === 'success') return <Badge className="bg-green-500"><Check className="w-3 h-3 mr-1" /> Success</Badge>;
    return <Badge variant="destructive"><X className="w-3 h-3 mr-1" /> Failed</Badge>;
  };

  return (
    <div className="container mx-auto p-6 space-y-6 h-[calc(100vh-100px)] flex flex-col">
      <div className="flex justify-between items-center shrink-0">
        <div>
          <h1 className="text-3xl font-bold">Bulk User Creation</h1>
          <p className="text-muted-foreground mt-1">
            Paste data directly from Excel/Sheets (Ctrl+V).
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleTestConnections}
            disabled={isValidating || parsedUsers.filter(u => u.email).length === 0}
          >
            {isValidating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2 text-yellow-500" />}
            Test Connections
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Settings2 className="w-4 h-4 mr-2" />
                Bulk Actions
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <UserCog className="w-4 h-4 mr-2" />
                  Set Role For All
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup onValueChange={handleBulkSetRole}>
                    <DropdownMenuRadioItem value="REGULAR">Regular</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="ADMIN">Admin</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="QUANT">Quant</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="CLIENT">Client</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuItem onClick={handleRemoveExistingUsers} className="text-orange-600">
                <Eraser className="w-4 h-4 mr-2" />
                Remove Existing Users
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleClearInvalidCredentials} className="text-orange-600">
                <Eraser className="w-4 h-4 mr-2" />
                Clear Invalid Keys
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleRemoveInvalid} className="text-red-600">
                <Eraser className="w-4 h-4 mr-2" />
                Remove Invalid Rows
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleClearAll} className="text-red-600">
                <Trash2 className="w-4 h-4 mr-2" />
                Clear All
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            onClick={handleBulkCreate}
            disabled={isLoading || parsedUsers.filter(u => u.email).length === 0}
            className="min-w-[140px]"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Create Users
              </>
            )}
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="shrink-0">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Mapping Dialog */}
      <Dialog open={isMappingDialogOpen} onOpenChange={setIsMappingDialogOpen}>
        <DialogContent className="sm:max-w-[900px]">
          <DialogHeader>
            <DialogTitle>Map Columns</DialogTitle>
            <DialogDescription>
              Match your pasted data columns to the correct fields.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 overflow-x-auto">
            <div className="min-w-[800px]">
              <div className="flex gap-4 mb-4">
                {rawImportData[0]?.map((_, colIndex) => (
                  <div key={colIndex} className="flex-1 min-w-[150px]">
                    <Select
                      value={columnMapping[colIndex] || 'ignore'}
                      onValueChange={(val) => setColumnMapping(prev => ({ ...prev, [colIndex]: val as FieldType }))}
                    >
                      <SelectTrigger className={columnMapping[colIndex] === 'ignore' ? 'opacity-50' : 'border-primary'}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(FIELD_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              <div className="border rounded-md max-h-[400px] overflow-y-auto">
                <Table>
                  <TableBody>
                    {rawImportData.slice(0, 10).map((row, rowIndex) => (
                      <TableRow key={rowIndex}>
                        {row.map((cell, cellIndex) => (
                          <TableCell key={cellIndex} className={`min-w-[150px] ${columnMapping[cellIndex] === 'ignore' ? 'text-muted-foreground bg-muted/30' : ''}`}>
                            <div className="truncate max-w-[150px]" title={cell}>{cell}</div>
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsMappingDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleImportConfirm}>Import Data</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Main Grid UI */}
      {!results ? (
        <Card className="flex-1 overflow-hidden border-0 shadow-lg flex flex-col">
          <CardContent className="p-0 flex-1 overflow-auto relative">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
                <TableRow>
                  <TableHead className="w-[40px] text-center">#</TableHead>
                  <TableHead className="min-w-[220px]">Email</TableHead>
                  <TableHead className="min-w-[180px]">Name</TableHead>
                  <TableHead className="min-w-[150px]">Password</TableHead>
                  <TableHead className="min-w-[120px]">Role</TableHead>
                  <TableHead className="min-w-[150px]">Phone</TableHead>
                  <TableHead className="min-w-[200px]">API Key</TableHead>
                  <TableHead className="min-w-[200px]">API Secret</TableHead>
                  <TableHead className="w-[40px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parsedUsers.map((user, index) => (
                  <TableRow
                    key={user.id}
                    className={`
                      hover:bg-muted/50
                      ${user.validationStatus?.emailExists ? 'bg-yellow-50/50' : ''}
                    `}
                  >
                    <TableCell className="text-muted-foreground font-mono text-xs text-center">{index + 1}</TableCell>

                    {/* Email */}
                    <TableCell className="p-1">
                      <div className="relative">
                        <Input
                          value={user.email}
                          onChange={(e) => handleUpdateUser(user.id, 'email', e.target.value)}
                          className={`h-8 border-0 shadow-none focus-visible:ring-1 focus-visible:ring-inset ${user.errors?.email ? "bg-red-50 text-red-900" : "bg-transparent"}`}
                          placeholder="user@example.com"
                        />
                        {user.validationStatus?.emailExists && (
                          <div className="absolute right-2 top-1/2 -translate-y-1/2 text-yellow-600 text-[10px] font-bold bg-yellow-100 px-1 rounded">EXISTS</div>
                        )}
                      </div>
                    </TableCell>

                    {/* Name */}
                    <TableCell className="p-1">
                      <Input
                        value={user.name}
                        onChange={(e) => handleUpdateUser(user.id, 'name', e.target.value)}
                        className={`h-8 border-0 shadow-none focus-visible:ring-1 focus-visible:ring-inset ${user.errors?.name ? "bg-red-50" : "bg-transparent"}`}
                      />
                    </TableCell>

                    {/* Password */}
                    <TableCell className="p-1">
                      <Input
                        value={user.password}
                        onChange={(e) => handleUpdateUser(user.id, 'password', e.target.value)}
                        className={`h-8 border-0 shadow-none focus-visible:ring-1 focus-visible:ring-inset ${user.errors?.password ? "bg-red-50" : "bg-transparent"}`}
                        type="password"
                      />
                    </TableCell>

                    {/* Role */}
                    <TableCell className="p-1">
                      <Select
                        value={user.role}
                        onValueChange={(val) => handleUpdateUser(user.id, 'role', val)}
                      >
                        <SelectTrigger className="h-8 border-0 shadow-none focus:ring-1 focus:ring-inset bg-transparent">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="REGULAR">Regular</SelectItem>
                          <SelectItem value="ADMIN">Admin</SelectItem>
                          <SelectItem value="QUANT">Quant</SelectItem>
                          <SelectItem value="CLIENT">Client</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>

                    {/* Phone */}
                    <TableCell className="p-1">
                      <Input
                        value={user.phoneNumber}
                        onChange={(e) => handleUpdateUser(user.id, 'phoneNumber', e.target.value)}
                        className="h-8 border-0 shadow-none focus-visible:ring-1 focus-visible:ring-inset bg-transparent"
                      />
                    </TableCell>

                    {/* API Key */}
                    <TableCell className="p-1">
                      <div className="relative">
                        <Input
                          value={user.apiKey}
                          onChange={(e) => handleUpdateUser(user.id, 'apiKey', e.target.value)}
                          className={`h-8 font-mono text-xs border-0 shadow-none focus-visible:ring-1 focus-visible:ring-inset
                            ${user.errors?.apiKey ? "bg-red-50" : "bg-transparent"}
                            ${user.validationStatus?.credentialsValid === false ? "ring-2 ring-red-500 ring-inset bg-red-50" : ""}
                            ${user.validationStatus?.credentialsValid === true ? "ring-1 ring-green-500 ring-inset bg-green-50" : ""}
                          `}
                          type="password"
                        />
                        {user.validationStatus?.credentialsValid === false && (
                          <div className="absolute right-2 top-1/2 -translate-y-1/2 text-red-600">
                            <AlertCircle className="w-3 h-3" />
                          </div>
                        )}
                      </div>
                    </TableCell>

                    {/* API Secret */}
                    <TableCell className="p-1">
                      <Input
                        value={user.apiSecret}
                        onChange={(e) => handleUpdateUser(user.id, 'apiSecret', e.target.value)}
                        className={`h-8 font-mono text-xs border-0 shadow-none focus-visible:ring-1 focus-visible:ring-inset
                          ${user.errors?.apiSecret ? "bg-red-50" : "bg-transparent"}
                          ${user.validationStatus?.credentialsValid === false ? "ring-2 ring-red-500 ring-inset bg-red-50" : ""}
                          ${user.validationStatus?.credentialsValid === true ? "ring-1 ring-green-500 ring-inset bg-green-50" : ""}
                        `}
                        type="password"
                      />
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="p-1 text-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteUser(user.id)}
                        className="h-6 w-6 text-muted-foreground hover:text-red-500 hover:bg-red-50"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}

                {/* Add Row Button at bottom */}
                <TableRow>
                  <TableCell colSpan={9} className="p-2 text-center">
                    <Button variant="ghost" onClick={handleAddUser} className="w-full h-8 text-muted-foreground dashed border border-dashed">
                      <Plus className="w-3 h-3 mr-2" /> Add Row
                    </Button>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-0 shadow-lg flex-1 overflow-hidden flex flex-col">
          <CardHeader className="bg-muted/30 border-b shrink-0">
            <CardTitle>Creation Results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 p-6 flex-1 overflow-auto">
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="text-2xl font-bold">{results.summary?.total}</p>
              </div>
              <div className="bg-green-50 p-4 rounded-lg border border-green-100">
                <p className="text-sm text-muted-foreground">Successful</p>
                <p className="text-2xl font-bold text-green-600">{results.summary?.successful}</p>
              </div>
              <div className="bg-red-50 p-4 rounded-lg border border-red-100">
                <p className="text-sm text-muted-foreground">Failed</p>
                <p className="text-2xl font-bold text-red-600">{results.summary?.failed}</p>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg border border-purple-100">
                <p className="text-sm text-muted-foreground">Credentials Stored</p>
                <p className="text-2xl font-bold text-purple-600">{results.summary?.credentialsStored}</p>
              </div>
              <div className="bg-orange-50 p-4 rounded-lg border border-orange-100">
                <p className="text-sm text-muted-foreground">Invalid Credentials</p>
                <p className="text-2xl font-bold text-orange-600">{results.summary?.credentialsInvalid}</p>
              </div>
            </div>

            {/* Detailed Results */}
            <div className="border rounded-md">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Credentials</TableHead>
                    <TableHead>Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.results?.map((result, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-mono text-sm">{result.email}</TableCell>
                      <TableCell>{getStatusBadge(result.status)}</TableCell>
                      <TableCell>
                        {result.credentialValidation === 'valid' && <Badge className="bg-green-500">Valid</Badge>}
                        {result.credentialValidation === 'invalid' && <Badge variant="destructive">Invalid</Badge>}
                        {result.credentialValidation === 'skipped' && <Badge variant="secondary">Skipped</Badge>}
                      </TableCell>
                      <TableCell className="text-sm text-red-600">{result.error || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <Button
              onClick={() => {
                setResults(null);
                setParsedUsers([createEmptyUser()]);
              }}
              variant="outline"
              className="w-full"
            >
              Create More Users
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
