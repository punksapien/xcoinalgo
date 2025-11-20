import { apiClient, ApiError } from '@/lib/api-client';

/**
 * User profile data structure
 */
export interface UserProfile {
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

/**
 * Profile update payload
 */
export interface ProfileUpdateData {
  name: string;
  phoneNumber?: string | null;
}

/**
 * Password change payload
 */
export interface PasswordChangeData {
  currentPassword: string;
  newPassword: string;
}

/**
 * API response for profile operations
 */
interface ProfileResponse {
  success: boolean;
  user: UserProfile;
}

/**
 * Get current user's profile
 * @returns {Promise<UserProfile>} User profile data
 * @throws {ApiError} If the request fails
 */
export async function getUserProfile(): Promise<UserProfile> {
  const response = await apiClient.get<ProfileResponse>('/api/user/profile');
  return response.user;
}

/**
 * Update user profile (name and phone number)
 * @param {ProfileUpdateData} data - Profile data to update
 * @returns {Promise<UserProfile>} Updated user profile
 * @throws {ApiError} If the request fails or validation fails
 */
export async function updateProfile(data: ProfileUpdateData): Promise<UserProfile> {
  // Validate name
  if (!data.name || data.name.trim().length < 2) {
    throw new ApiError('Name must be at least 2 characters long', 400);
  }

  if (data.name.length > 100) {
    throw new ApiError('Name must be less than 100 characters', 400);
  }

  const response = await apiClient.put<ProfileResponse>('/api/user/profile', {
    name: data.name,
    phoneNumber: data.phoneNumber || null,
  });

  return response.user;
}

/**
 * Change user password (for email/password users only)
 * @param {PasswordChangeData} data - Current and new password
 * @returns {Promise<void>}
 * @throws {ApiError} If the request fails, current password is incorrect, or user is OAuth user
 */
export async function changePassword(data: PasswordChangeData): Promise<void> {
  // Validate passwords
  if (!data.currentPassword) {
    throw new ApiError('Current password is required', 400);
  }

  if (!data.newPassword || data.newPassword.length < 8) {
    throw new ApiError('New password must be at least 8 characters long', 400);
  }

  await apiClient.put<{ success: boolean; message: string }>('/api/user/change-password', {
    currentPassword: data.currentPassword,
    newPassword: data.newPassword,
  });
}

/**
 * Check if user can change password (not an OAuth user)
 * @returns {Promise<boolean>} True if user can change password
 */
export async function canUserChangePassword(): Promise<boolean> {
  try {
    const profile = await getUserProfile();
    return profile.canChangePassword;
  } catch (error) {
    console.error('Failed to check password change capability:', error);
    return false;
  }
}
