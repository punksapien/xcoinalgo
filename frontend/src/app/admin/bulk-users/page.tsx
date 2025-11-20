'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Upload, Check, X, AlertCircle, Loader2 } from 'lucide-react';

interface BulkUser {
  email: string;
  name: string;
  password: string;
  phoneNumber?: string;
  role?: string;
  apiKey?: string;
  apiSecret?: string;
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

  const parseCSV = (content: string): BulkUser[] => {
    const lines = content.split('\n').filter(line => line.trim() !== '');
    const dataLines = lines.slice(1); // Skip header

    return dataLines.map(line => {
      const parts = line.split(',').map(p => p.trim());
      const [email, name, password, phoneNumber, role, apiKey, apiSecret] = parts;

      return {
        email,
        name,
        password,
        phoneNumber: phoneNumber || undefined,
        role: role || 'REGULAR',
        apiKey: apiKey || undefined,
        apiSecret: apiSecret || undefined,
      };
    });
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvFile(file);
    setError('');
    setResults(null);

    try {
      const content = await file.text();
      const users = parseCSV(content);
      setParsedUsers(users);
    } catch (err) {
      setError('Failed to parse CSV file. Please check the format.');
      setParsedUsers([]);
    }
  };

  const handleBulkCreate = async () => {
    if (parsedUsers.length === 0) {
      setError('No users to create');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/admin/users/bulk-create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ users: parsedUsers }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create users');
      }

      const data = await response.json();
      setResults(data);
      setParsedUsers([]); // Clear preview
      setCsvFile(null); // Clear file
    } catch (err: any) {
      setError(err.message);
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
      <div>
        <h1 className="text-3xl font-bold">Bulk User Creation</h1>
        <p className="text-muted-foreground mt-2">
          Upload a CSV file to create multiple user accounts at once with automatic broker credential validation
        </p>
      </div>

      {/* CSV Format Info */}
      <Card>
        <CardHeader>
          <CardTitle>CSV Format</CardTitle>
          <CardDescription>
            Your CSV file should have the following columns (first row is header):
          </CardDescription>
        </CardHeader>
        <CardContent>
          <code className="block bg-muted p-4 rounded text-sm">
            email,name,password,phoneNumber,role,apiKey,apiSecret
          </code>
          <div className="mt-4 text-sm text-muted-foreground">
            <p><strong>Example:</strong></p>
            <code className="block bg-muted p-2 rounded mt-2">
              john@example.com,John Doe,Password123,,REGULAR,api_key_here,api_secret_here
            </code>
          </div>
        </CardContent>
      </Card>

      {/* File Upload */}
      <Card>
        <CardHeader>
          <CardTitle>Upload CSV File</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="csv-file">Select CSV File</Label>
            <Input
              id="csv-file"
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              className="mt-2"
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Preview Table */}
      {parsedUsers.length > 0 && !results && (
        <Card>
          <CardHeader>
            <CardTitle>Preview ({parsedUsers.length} users)</CardTitle>
            <CardDescription>
              Review the users before creating them
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-96 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Has Credentials</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedUsers.map((user, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-mono text-sm">{user.email}</TableCell>
                      <TableCell>{user.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{user.role || 'REGULAR'}</Badge>
                      </TableCell>
                      <TableCell>
                        {user.apiKey && user.apiSecret ? (
                          <Badge className="bg-blue-500">Yes</Badge>
                        ) : (
                          <Badge variant="secondary">No</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="mt-6">
              <Button
                onClick={handleBulkCreate}
                disabled={isLoading}
                size="lg"
                className="w-full"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating {parsedUsers.length} users...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Create {parsedUsers.length} Users
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {results && (
        <Card>
          <CardHeader>
            <CardTitle>Results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="text-2xl font-bold">{results.summary?.total}</p>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <p className="text-sm text-muted-foreground">Successful</p>
                <p className="text-2xl font-bold text-green-600">{results.summary?.successful}</p>
              </div>
              <div className="bg-red-50 p-4 rounded-lg">
                <p className="text-sm text-muted-foreground">Failed</p>
                <p className="text-2xl font-bold text-red-600">{results.summary?.failed}</p>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg">
                <p className="text-sm text-muted-foreground">Credentials Stored</p>
                <p className="text-2xl font-bold text-purple-600">{results.summary?.credentialsStored}</p>
              </div>
              <div className="bg-orange-50 p-4 rounded-lg">
                <p className="text-sm text-muted-foreground">Invalid Credentials</p>
                <p className="text-2xl font-bold text-orange-600">{results.summary?.credentialsInvalid}</p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-muted-foreground">Skipped Credentials</p>
                <p className="text-2xl font-bold text-gray-600">{results.summary?.credentialsSkipped}</p>
              </div>
            </div>

            {/* Detailed Results */}
            <div className="max-h-96 overflow-auto">
              <Table>
                <TableHeader>
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
