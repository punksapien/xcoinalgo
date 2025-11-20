'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Upload, Check, X, AlertCircle, Loader2, Trash2, Plus, Save, FileUp, ClipboardPaste } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";

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
}

interface BulkUserResult {
  email: string;
  status: 'success' | 'failed';
  userId?: string;
  credentialsStored: boolean;
  credentialValidation?: 'valid' | 'invalid' | 'skipped' | 'error';
  error?: string;
}

export default function BulkUsersPage() {
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [parsedUsers, setParsedUsers] = useState<BulkUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
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
  const [pasteContent, setPasteContent] = useState('');
  const [isPasteDialogOpen, setIsPasteDialogOpen] = useState(false);

  // Validate a single user
  const validateUser = (user: BulkUser): Record<string, string> => {
    const errors: Record<string, string> = {};

    if (!user.email) errors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email)) errors.email = 'Invalid email format';

    if (!user.name) errors.name = 'Name is required';
    if (!user.password) errors.password = 'Password is required';

    // API Key validation - if one exists, both must exist
    if ((user.apiKey && !user.apiSecret) || (!user.apiKey && user.apiSecret)) {
      errors.apiKey = 'Both API Key and Secret are required';
      errors.apiSecret = 'Both API Key and Secret are required';
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

      // Only update state if errors actually changed to avoid infinite loop
      const hasChanges = updatedUsers.some((u, i) =>
        JSON.stringify(u.errors) !== JSON.stringify(parsedUsers[i].errors)
      );

      if (hasChanges) {
        setParsedUsers(updatedUsers);
      }
    }
  }, [parsedUsers]);

  const parseData = (content: string): BulkUser[] => {
    const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length === 0) return [];

    // Detect delimiter (Tab for Excel, Comma for CSV)
    const firstLine = lines[0];
    const isTabSeparated = firstLine.includes('\t');
    const delimiter = isTabSeparated ? '\t' : ',';

    // Check for header row
    const headerParts = firstLine.split(delimiter).map(p => p.trim().toLowerCase());
    const hasHeader = headerParts.includes('email') && (headerParts.includes('name') || headerParts.includes('password'));

    const dataLines = hasHeader ? lines.slice(1) : lines;

    // Map columns based on header or default order
    const getColIndex = (name: string, defaultIdx: number) => {
      if (!hasHeader) return defaultIdx;
      const idx = headerParts.findIndex(h => h.includes(name));
      return idx !== -1 ? idx : defaultIdx;
    };

    const emailIdx = getColIndex('email', 0);
    const nameIdx = getColIndex('name', 1);
    const passwordIdx = getColIndex('password', 2);
    const phoneIdx = getColIndex('phone', 3);
    const roleIdx = getColIndex('role', 4);
    const apiKeyIdx = getColIndex('api', 5); // Matches apiKey or api_key
    const apiSecretIdx = getColIndex('secret', 6);

    return dataLines.map((line) => {
      // Handle CSV quotes if comma separated
      let parts: string[];
      if (delimiter === ',') {
        // Simple regex for CSV parsing to handle quotes
        const matches = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
        parts = matches ? matches.map(m => m.replace(/^"|"$/g, '').trim()) : line.split(',').map(p => p.trim());
        // Fallback if regex fails or simple split is needed
        if (!parts || parts.length < 3) parts = line.split(',').map(p => p.trim());
      } else {
        parts = line.split(delimiter).map(p => p.trim());
      }

      const user: BulkUser = {
        id: crypto.randomUUID(),
        email: parts[emailIdx] || '',
        name: parts[nameIdx] || '',
        password: parts[passwordIdx] || '',
        phoneNumber: parts[phoneIdx] || '',
        role: parts[roleIdx] || 'REGULAR',
        apiKey: parts[apiKeyIdx] || '',
        apiSecret: parts[apiSecretIdx] || '',
      };

      user.errors = validateUser(user);
      return user;
    });
  };

  const handlePasteProcess = () => {
    if (!pasteContent.trim()) return;

    const users = parseData(pasteContent);
    setParsedUsers(prev => [...prev, ...users]);
    setPasteContent('');
    setIsPasteDialogOpen(false);
    setError('');
    setResults(null);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvFile(file);
    setError('');
    setResults(null);

    try {
      const content = await file.text();
      const users = parseData(content);
      setParsedUsers(users);
    } catch {
      setError('Failed to parse file. Please check the format.');
      setParsedUsers([]);
    }
  };

  const handleUpdateUser = (id: string, field: keyof BulkUser, value: string) => {
    setParsedUsers(prev => prev.map(user => {
      if (user.id === id) {
        const updatedUser = { ...user, [field]: value };
        // Validate immediately
        updatedUser.errors = validateUser(updatedUser);
        return updatedUser;
      }
      return user;
    }));
  };

  const handleDeleteUser = (id: string) => {
    setParsedUsers(prev => prev.filter(user => user.id !== id));
  };

  const handleAddUser = () => {
    const newUser: BulkUser = {
      id: crypto.randomUUID(),
      email: '',
      name: '',
      password: '',
      phoneNumber: '',
      role: 'REGULAR',
      apiKey: '',
      apiSecret: '',
    };
    newUser.errors = validateUser(newUser);
    setParsedUsers(prev => [...prev, newUser]);
  };

  const handleClearAll = () => {
    setParsedUsers([]);
    setCsvFile(null);
    setResults(null);
    setError('');
  };

  const handleBulkCreate = async () => {
    if (parsedUsers.length === 0) {
      setError('No users to create');
      return;
    }

    // Check for validation errors
    const hasErrors = parsedUsers.some(u => u.errors && Object.keys(u.errors).length > 0);
    if (hasErrors) {
      setError('Please fix validation errors before proceeding');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      // Clean data before sending (remove id, errors)
      const usersToSend = parsedUsers.map(({ id, errors, ...user }) => ({
        ...user,
        phoneNumber: user.phoneNumber || undefined,
        apiKey: user.apiKey || undefined,
        apiSecret: user.apiSecret || undefined,
      }));

      const response = await fetch('/api/admin/users/bulk-create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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
      setCsvFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusBadge = (status: 'success' | 'failed') => {
    if (status === 'success') {
      return <Badge className="bg-green-500"><Check className="w-3 h-3 mr-1" /> Success</Badge>;
    }
    return <Badge variant="destructive"><X className="w-3 h-3 mr-1" /> Failed</Badge>;
  };

  const getCredentialBadge = (validation?: string) => {
    if (!validation) return null;

    switch (validation) {
      case 'valid':
        return <Badge className="bg-green-500"><Check className="w-3 h-3 mr-1" /> Valid</Badge>;
      case 'invalid':
        return <Badge variant="destructive"><X className="w-3 h-3 mr-1" /> Invalid</Badge>;
      case 'skipped':
        return <Badge variant="secondary">Skipped</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Bulk User Creation</h1>
          <p className="text-muted-foreground mt-2">
            Manage and create multiple user accounts
          </p>
        </div>
        <div className="flex gap-2">
          {parsedUsers.length > 0 && !results && (
            <Button variant="outline" onClick={handleClearAll} className="text-red-500 hover:text-red-600">
              <Trash2 className="w-4 h-4 mr-2" />
              Clear All
            </Button>
          )}

          <Dialog open={isPasteDialogOpen} onOpenChange={setIsPasteDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="secondary">
                <ClipboardPaste className="w-4 h-4 mr-2" />
                Paste Data
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle>Paste from Excel or CSV</DialogTitle>
                <DialogDescription>
                  Copy your data from Excel, Google Sheets, or a CSV file and paste it below.
                  <br />
                  <span className="text-xs text-muted-foreground">Expected columns: Email, Name, Password, Phone, Role, API Key, API Secret</span>
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <Textarea
                  placeholder="Paste your data here..."
                  className="min-h-[200px] font-mono text-xs"
                  value={pasteContent}
                  onChange={(e) => setPasteContent(e.target.value)}
                />
              </div>
              <DialogFooter>
                <Button onClick={handlePasteProcess}>Import Data</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {parsedUsers.length > 0 && !results && (
            <Button onClick={handleAddUser}>
              <Plus className="w-4 h-4 mr-2" />
              Add Row
            </Button>
          )}
        </div>
      </div>

      {/* Initial State / Upload */}
      {parsedUsers.length === 0 && !results && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="border-dashed border-2 hover:bg-muted/5 transition-colors cursor-pointer" onClick={() => document.getElementById('csv-file')?.click()}>
            <CardContent className="flex flex-col items-center justify-center h-[200px] space-y-4">
              <div className="p-4 bg-primary/10 rounded-full">
                <FileUp className="w-8 h-8 text-primary" />
              </div>
              <div className="text-center">
                <h3 className="font-semibold text-lg">Upload CSV File</h3>
                <p className="text-sm text-muted-foreground">Drag & drop or click to browse</p>
              </div>
              <Input
                id="csv-file"
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                className="hidden"
              />
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:bg-muted/5 transition-colors" onClick={() => setIsPasteDialogOpen(true)}>
            <CardContent className="flex flex-col items-center justify-center h-[200px] space-y-4">
              <div className="p-4 bg-secondary rounded-full">
                <ClipboardPaste className="w-8 h-8 text-secondary-foreground" />
              </div>
              <div className="text-center">
                <h3 className="font-semibold text-lg">Paste from Clipboard</h3>
                <p className="text-sm text-muted-foreground">Copy from Excel/Sheets and paste</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Interactive Table */}
      {parsedUsers.length > 0 && !results && (
        <Card className="overflow-hidden border-0 shadow-lg">
          <CardHeader className="bg-muted/30 border-b">
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>User Management ({parsedUsers.length} users)</CardTitle>
                <CardDescription>Review and edit user details before creation</CardDescription>
              </div>
              <div className="flex gap-2">
                <Badge variant="outline" className="bg-background">
                  {parsedUsers.filter(u => !u.errors || Object.keys(u.errors).length === 0).length} Valid
                </Badge>
                <Badge variant="destructive">
                  {parsedUsers.filter(u => u.errors && Object.keys(u.errors).length > 0).length} Errors
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[600px] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
                  <TableRow>
                    <TableHead className="w-[50px]">#</TableHead>
                    <TableHead className="min-w-[200px]">Email</TableHead>
                    <TableHead className="min-w-[150px]">Name</TableHead>
                    <TableHead className="min-w-[150px]">Password</TableHead>
                    <TableHead className="min-w-[120px]">Role</TableHead>
                    <TableHead className="min-w-[150px]">Phone (Opt)</TableHead>
                    <TableHead className="min-w-[200px]">API Key (Opt)</TableHead>
                    <TableHead className="min-w-[200px]">API Secret (Opt)</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedUsers.map((user, index) => (
                    <TableRow key={user.id} className="hover:bg-muted/50">
                      <TableCell className="text-muted-foreground font-mono text-xs">{index + 1}</TableCell>

                      {/* Email */}
                      <TableCell>
                        <div className="space-y-1">
                          <Input
                            value={user.email}
                            onChange={(e) => handleUpdateUser(user.id, 'email', e.target.value)}
                            className={`h-8 ${user.errors?.email ? "border-red-500 bg-red-50" : ""}`}
                            placeholder="user@example.com"
                          />
                          {user.errors?.email && (
                            <p className="text-[10px] text-red-500 font-medium">{user.errors.email}</p>
                          )}
                        </div>
                      </TableCell>

                      {/* Name */}
                      <TableCell>
                        <div className="space-y-1">
                          <Input
                            value={user.name}
                            onChange={(e) => handleUpdateUser(user.id, 'name', e.target.value)}
                            className={`h-8 ${user.errors?.name ? "border-red-500 bg-red-50" : ""}`}
                            placeholder="John Doe"
                          />
                        </div>
                      </TableCell>

                      {/* Password */}
                      <TableCell>
                        <div className="space-y-1">
                          <Input
                            value={user.password}
                            onChange={(e) => handleUpdateUser(user.id, 'password', e.target.value)}
                            className={`h-8 ${user.errors?.password ? "border-red-500 bg-red-50" : ""}`}
                            placeholder="••••••••"
                            type="password"
                          />
                        </div>
                      </TableCell>

                      {/* Role */}
                      <TableCell>
                        <Select
                          value={user.role}
                          onValueChange={(val) => handleUpdateUser(user.id, 'role', val)}
                        >
                          <SelectTrigger className="h-8">
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
                      <TableCell>
                        <Input
                          value={user.phoneNumber}
                          onChange={(e) => handleUpdateUser(user.id, 'phoneNumber', e.target.value)}
                          placeholder="+1234567890"
                          className="h-8"
                        />
                      </TableCell>

                      {/* API Key */}
                      <TableCell>
                        <div className="space-y-1">
                          <Input
                            value={user.apiKey}
                            onChange={(e) => handleUpdateUser(user.id, 'apiKey', e.target.value)}
                            className={`h-8 font-mono text-xs ${user.errors?.apiKey ? "border-red-500 bg-red-50" : ""}`}
                            placeholder="Key"
                            type="password"
                          />
                        </div>
                      </TableCell>

                      {/* API Secret */}
                      <TableCell>
                        <div className="space-y-1">
                          <Input
                            value={user.apiSecret}
                            onChange={(e) => handleUpdateUser(user.id, 'apiSecret', e.target.value)}
                            className={`h-8 font-mono text-xs ${user.errors?.apiSecret ? "border-red-500 bg-red-50" : ""}`}
                            placeholder="Secret"
                            type="password"
                          />
                        </div>
                      </TableCell>

                      {/* Actions */}
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteUser(user.id)}
                          className="h-8 w-8 text-muted-foreground hover:text-red-500 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="p-4 border-t bg-muted/20 flex justify-between items-center">
              <div className="text-sm text-muted-foreground">
                {parsedUsers.length} users ready to create
              </div>
              <Button
                onClick={handleBulkCreate}
                disabled={isLoading || parsedUsers.some(u => u.errors && Object.keys(u.errors).length > 0)}
                size="lg"
                className="min-w-[200px] shadow-md"
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
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {results && (
        <Card className="border-0 shadow-lg">
          <CardHeader className="bg-muted/30 border-b">
            <CardTitle>Results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 p-6">
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
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                <p className="text-sm text-muted-foreground">Skipped Credentials</p>
                <p className="text-2xl font-bold text-gray-600">{results.summary?.credentialsSkipped}</p>
              </div>
            </div>

            {/* Detailed Results */}
            <div className="max-h-96 overflow-auto border rounded-md">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Credentials</TableHead>
                    <TableHead>User ID</TableHead>
                    <TableHead>Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.results?.map((result, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-mono text-sm">{result.email}</TableCell>
                      <TableCell>{getStatusBadge(result.status)}</TableCell>
                      <TableCell>{getCredentialBadge(result.credentialValidation)}</TableCell>
                      <TableCell className="font-mono text-xs">{result.userId || '-'}</TableCell>
                      <TableCell className="text-sm text-red-600">{result.error || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <Button
              onClick={() => {
                setResults(null);
                setParsedUsers([]);
                setCsvFile(null);
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
