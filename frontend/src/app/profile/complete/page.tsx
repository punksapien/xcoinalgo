'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { User, Loader2, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { showSuccessToast, showErrorToast } from '@/lib/toast-utils';
import { apiClient, ApiError } from '@/lib/api-client';

// Profile completion schema
const profileCompletionSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100, 'Name must be less than 100 characters'),
});

type ProfileCompletionFormValues = z.infer<typeof profileCompletionSchema>;

export default function ProfileCompletePage() {
  const router = useRouter();
  const { user, isAuthenticated, hasHydrated, login, token } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Profile completion form
  const form = useForm<ProfileCompletionFormValues>({
    resolver: zodResolver(profileCompletionSchema),
    defaultValues: {
      name: '',
    },
  });

  // Check auth
  useEffect(() => {
    if (hasHydrated) {
      if (!isAuthenticated) {
        router.push('/login');
      } else if (user?.name) {
        // User already has a name, redirect to dashboard
        router.push('/dashboard');
      }
    }
  }, [hasHydrated, isAuthenticated, user, router]);

  // Handle profile completion
  const onSubmit = async (data: ProfileCompletionFormValues) => {
    try {
      setIsSubmitting(true);

      const response = await apiClient.put<{
        success: boolean;
        user: {
          id: string;
          email: string;
          name: string;
          phoneNumber?: string;
          role: string;
          emailVerified?: string;
          createdAt: string;
          updatedAt: string;
          canChangePassword: boolean;
        };
      }>('/api/user/profile', {
        name: data.name,
      });

      // Update Zustand store
      if (user && token) {
        login(
          {
            ...user,
            name: response.user.name,
          },
          token
        );
      }

      // Set localStorage flag to indicate profile is complete
      if (user?.id) {
        localStorage.setItem(`profile_complete_${user.id}`, 'true');
      }

      showSuccessToast('Success', 'Profile completed successfully');

      // Redirect to dashboard
      router.push('/dashboard');
    } catch (error) {
      if (error instanceof ApiError) {
        showErrorToast('Error', error.message);
      } else {
        showErrorToast('Error', 'Failed to complete profile');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!hasHydrated || !isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // If user already has a name, don't show this page
  if (user?.name) {
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full">
        <Card className="border-2">
          <CardHeader className="text-center space-y-2">
            <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-2">
              <CheckCircle2 className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-2xl">Complete Your Profile</CardTitle>
            <CardDescription>
              We need a few more details to set up your account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name *</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                          <Input
                            placeholder="Enter your full name"
                            className="pl-10"
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormDescription>
                        This name will be displayed on strategies you create
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-2">
                  <FormLabel>Email Address</FormLabel>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted px-4 py-3 rounded-md">
                    <User className="h-4 w-4" />
                    <span>{user?.email}</span>
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Complete Profile'
                  )}
                </Button>

                <p className="text-xs text-center text-muted-foreground">
                  This information is required to access your dashboard
                </p>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
