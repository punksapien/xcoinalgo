'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Upload Strategy Page - DISABLED FOR CLIENTS
 *
 * Strategy uploads should only be done by the quant team via:
 * 1. Backend upload script (upload_strategy.sh)
 * 2. Backend API endpoint (/api/strategy-upload/cli-upload)
 *
 * Clients should only view and subscribe to strategies.
 */
export default function StrategyUploadPageDisabled() {
  const router = useRouter();

  useEffect(() => {
    // Auto-redirect to strategies page after 3 seconds
    const timer = setTimeout(() => {
      router.push('/dashboard/strategies');
    }, 3000);

    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <Card className="border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-800">
        <CardHeader>
          <div className="flex items-center gap-3">
            <AlertCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
            <CardTitle className="text-xl text-red-800 dark:text-red-300">
              Access Restricted
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-red-700 dark:text-red-200">
            Strategy uploads are restricted to the quant team only.
          </p>
          <p className="text-red-600 dark:text-red-300 text-sm">
            If you're a client, you can browse and subscribe to available strategies from the strategies page.
          </p>
          <p className="text-red-600 dark:text-red-300 text-sm">
            If you're a quant team member, please use the backend upload script or CLI tools to upload strategies.
          </p>
          <div className="pt-4">
            <Button
              onClick={() => router.push('/dashboard/strategies')}
              variant="outline"
              className="border-red-300 text-red-700 hover:bg-red-100 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/20"
            >
              Go to Strategies
            </Button>
          </div>
          <p className="text-xs text-red-500 dark:text-red-400 pt-2">
            Redirecting automatically in 3 seconds...
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
