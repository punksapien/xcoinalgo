'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { User, Lock, Mail, Phone, Shield, Calendar, CheckCircle2, Loader2 } from 'lucide-react';
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
import { Separator } from '@/components/ui/separator';
import { showSuccessToast, showErrorToast } from '@/lib/toast-utils';
import { apiClient, ApiError } from '@/lib/api-client';

// Profile update schema
const profileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100, 'Name must be less than 100 characters'),
  phoneNumber: z.string().optional().or(z.literal('')),
});

// Password change schema
const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string().min(1, 'Please confirm your password'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type ProfileFormValues = z.infer<typeof profileSchema>;
type PasswordFormValues = z.infer<typeof passwordSchema>;

interface ProfileData {
  id: string;
  email: string;
  name?: string;
  phoneNumber?: string;
  role: string;
  emailVerified?: string;
  createdAt: string;
  updatedAt: string;
  canChangePassword: boolean;
}

export default function ProfileSettingsPage() {
  const router = useRouter();
  const { user, isAuthenticated, hasHydrated, login, token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [updatingProfile, setUpdatingProfile] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  // Profile form
  const profileForm = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: '',
      phoneNumber: '',
    },
  });

  // Password form
  const passwordForm = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  });

  // Check auth
  useEffect(() => {
    if (hasHydrated && !isAuthenticated) {
      router.push('/login');
    }
  }, [hasHydrated, isAuthenticated, router]);

  // Fetch profile data
  useEffect(() => {
    const fetchProfile = async () => {
      if (!hasHydrated || !isAuthenticated) return;

      try {
        const response = await apiClient.get<{
          success: boolean;
          user: {
            id: string;
            email: string;
            name?: string;
            phoneNumber?: string;
            role: string;
            emailVerified?: string;
            createdAt: string;
            updatedAt: string;
            canChangePassword: boolean;
          };
        }>('/api/user/profile');

        setProfileData(response.user);

        // Set form default values
        profileForm.reset({
          name: response.user.name || '',
          phoneNumber: response.user.phoneNumber || '',
        });
      } catch (error) {
        if (error instanceof ApiError) {
          showErrorToast('Error', error.message);
        } else {
          showErrorToast('Error', 'Failed to load profile');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [hasHydrated, isAuthenticated, profileForm]);

  // Handle profile update
  const onProfileSubmit = async (data: ProfileFormValues) => {
    try {
      setUpdatingProfile(true);

      const response = await apiClient.put<{
        success: boolean;
        user: ProfileData;
      }>('/api/user/profile', {
        name: data.name,
        phoneNumber: data.phoneNumber || null,
      });

      // Update profile data
      setProfileData(response.user);

      // Update Zustand store
      if (user && token) {
        login(
          {
            ...user,
            name: response.user.name,
            phoneNumber: response.user.phoneNumber,
          },
          token
        );
      }

      showSuccessToast('Success', 'Profile updated successfully');
    } catch (error) {
      if (error instanceof ApiError) {
        showErrorToast('Error', error.message);
      } else {
        showErrorToast('Error', 'Failed to update profile');
      }
    } finally {
      setUpdatingProfile(false);
    }
  };

  // Handle password change
  const onPasswordSubmit = async (data: PasswordFormValues) => {
    try {
      setChangingPassword(true);

      await apiClient.put('/api/user/change-password', {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });

      showSuccessToast('Success', 'Password changed successfully');
      passwordForm.reset();
    } catch (error) {
      if (error instanceof ApiError) {
        showErrorToast('Error', error.message);
      } else {
        showErrorToast('Error', 'Failed to change password');
      }
    } finally {
      setChangingPassword(false);
    }
  };

  if (!hasHydrated || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="max-w-4xl">
      <div className="space-y-6">
        {/* Personal Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Personal Information
            </CardTitle>
            <CardDescription>
              Update your personal details and contact information
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...profileForm}>
              <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-4">
                <FormField
                  control={profileForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter your full name"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        This name will be displayed on strategies you create
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={profileForm.control}
                  name="phoneNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone Number</FormLabel>
                      <FormControl>
                        <div className="flex gap-2">
                          <Phone className="h-5 w-5 text-muted-foreground mt-2.5" />
                          <Input
                            placeholder="+1 234 567 8900 (optional)"
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormDescription>
                        Optional contact number for account recovery
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-2">
                  <FormLabel>Email Address</FormLabel>
                  <div className="flex gap-2">
                    <Mail className="h-5 w-5 text-muted-foreground mt-2.5" />
                    <Input
                      value={profileData?.email || ''}
                      disabled
                      className="bg-muted cursor-not-allowed"
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Email cannot be changed. Contact support if you need assistance.
                  </p>
                </div>

                <div className="flex justify-end pt-4">
                  <Button type="submit" disabled={updatingProfile}>
                    {updatingProfile ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      'Save Changes'
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>

        {/* Change Password - Only shown if canChangePassword */}
        {profileData?.canChangePassword && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5" />
                Change Password
              </CardTitle>
              <CardDescription>
                Update your password to keep your account secure
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...passwordForm}>
                <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
                  <FormField
                    control={passwordForm.control}
                    name="currentPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Current Password</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder="Enter current password"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Separator />

                  <FormField
                    control={passwordForm.control}
                    name="newPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>New Password</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder="Enter new password"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Must be at least 8 characters long
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={passwordForm.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirm New Password</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder="Confirm new password"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex justify-end pt-4">
                    <Button type="submit" disabled={changingPassword} variant="default">
                      {changingPassword ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Changing...
                        </>
                      ) : (
                        'Change Password'
                      )}
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        )}

        {/* OAuth User Info */}
        {!profileData?.canChangePassword && (
          <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
            <CardContent className="p-6">
              <div className="flex items-start space-x-3">
                <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-blue-900 dark:text-blue-100">
                    Google Account
                  </h3>
                  <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                    You signed in with Google. Password management is handled by your Google account.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Account Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Account Information
            </CardTitle>
            <CardDescription>
              Details about your account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between py-3 border-b">
                <span className="text-sm font-medium">Account Created</span>
                <span className="text-sm text-muted-foreground">
                  {profileData?.createdAt
                    ? new Date(profileData.createdAt).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })
                    : 'N/A'}
                </span>
              </div>

              <div className="flex items-center justify-between py-3 border-b">
                <span className="text-sm font-medium">Email Verification</span>
                <span className="flex items-center gap-2">
                  {profileData?.emailVerified ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <span className="text-sm text-green-600">Verified</span>
                    </>
                  ) : (
                    <span className="text-sm text-muted-foreground">Not verified</span>
                  )}
                </span>
              </div>

              <div className="flex items-center justify-between py-3">
                <span className="text-sm font-medium">Account Type</span>
                <span className="text-sm text-muted-foreground">
                  {profileData?.canChangePassword ? 'Email/Password' : 'Google OAuth'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
