'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Chrome, TrendingUp } from 'lucide-react';
import { useAuth } from '@/lib/auth';

export default function RegisterPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const { isAuthenticated, checkAuth } = useAuth();
  const router = useRouter();

  useEffect(() => {
    const checkAuthStatus = async () => {
      await checkAuth();
      setIsChecking(false);
    };
    checkAuthStatus();
  }, [checkAuth]);

  useEffect(() => {
    if (!isChecking && isAuthenticated) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, isChecking, router]);

  const handleGoogleSignup = async () => {
    try {
      setIsLoading(true);
      // Use NextAuth signIn - handles OAuth flow from frontend domain
      await signIn('google', {
        callbackUrl: '/dashboard',
        redirect: true
      });
    } catch (error) {
      console.error('Google signup error:', error);
      setIsLoading(false);
    }
  };

  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="flex justify-center">
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-10 w-10 text-blue-600" />
              <span className="text-2xl font-bold text-gray-900">XcoinAlgo</span>
            </div>
          </div>
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            Create your account
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Start your algorithmic trading journey
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-center">Get started today</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Button
                onClick={handleGoogleSignup}
                className="w-full bg-white text-gray-900 border border-gray-300 hover:bg-gray-50"
                disabled={isLoading}
              >
                <Chrome className="h-5 w-5 mr-3" />
                {isLoading ? 'Creating account...' : 'Continue with Google'}
              </Button>

              <div className="text-center">
                <p className="text-xs text-gray-500">
                  By continuing, you agree to our Terms of Service and Privacy Policy
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}