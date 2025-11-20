'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { OTPInput } from '@/components/auth/otp-input';
import { TrendingUp, Mail, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get('email');

  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Redirect if no email provided
  useEffect(() => {
    if (!email) {
      router.push('/register');
    }
  }, [email, router]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handleVerifyOTP = async (otp: string) => {
    try {
      setIsVerifying(true);
      setError('');

      const response = await fetch('/api/user/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Verification failed');
      }

      // Success! Mark as verified
      setSuccess(true);

      // Sign in with the returned token using NextAuth credentials provider
      const result = await signIn('credentials', {
        email,
        password: '', // We already have the token from verification
        redirect: false,
      });

      if (result?.error) {
        // If auto-login fails, redirect to login page
        setTimeout(() => {
          router.push('/login?verified=true');
        }, 2000);
      } else {
        // Success - redirect to dashboard
        setTimeout(() => {
          router.push('/dashboard');
        }, 2000);
      }
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Verification failed. Please try again.');
      setIsVerifying(false);
    }
  };

  const handleResendOTP = async () => {
    try {
      setIsResending(true);
      setError('');

      const response = await fetch('/api/user/resend-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to resend code');
      }

      // Start 60-second cooldown
      setResendCooldown(60);
      setIsResending(false);
    } catch (err) {
      const error = err as Error;
      setError(error.message || 'Failed to resend code. Please try again.');
      setIsResending(false);
    }
  };

  if (!email) {
    return null; // Will redirect in useEffect
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="rounded-full bg-green-100 p-3">
                  <CheckCircle className="h-12 w-12 text-green-600" />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-gray-900">Email Verified!</h2>
              <p className="text-gray-600">
                Your email has been successfully verified. Redirecting to dashboard...
              </p>
              <div className="flex justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
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
            Verify your email
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            We&apos;ve sent a 6-digit code to
          </p>
          <p className="text-sm font-medium text-gray-900">{email}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-center">Enter verification code</CardTitle>
            <CardDescription className="text-center">
              The code expires in 24 hours
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <OTPInput
                length={6}
                onComplete={handleVerifyOTP}
                disabled={isVerifying}
                error={!!error}
              />

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {isVerifying && (
                <div className="flex items-center justify-center space-x-2 text-sm text-gray-600">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Verifying code...</span>
                </div>
              )}
            </div>

            <div className="text-center space-y-2">
              <p className="text-sm text-gray-600">
                Didn&apos;t receive the code?
              </p>
              <Button
                variant="outline"
                onClick={handleResendOTP}
                disabled={isResending || resendCooldown > 0}
                className="w-full"
              >
                <Mail className="h-4 w-4 mr-2" />
                {isResending
                  ? 'Sending...'
                  : resendCooldown > 0
                  ? `Resend code (${resendCooldown}s)`
                  : 'Resend code'}
              </Button>
            </div>

            <div className="text-center">
              <Button
                variant="link"
                onClick={() => router.push('/register')}
                className="text-sm"
              >
                Use a different email
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}
