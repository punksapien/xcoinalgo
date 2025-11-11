import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import axios from 'axios';

interface User {
  id: string;
  email: string;
  createdAt: string;
  role?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  hasHydrated: boolean;
  login: (user: User, token: string) => void;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  isQuant: () => boolean;
  isClient: () => boolean;
  isAdmin: () => boolean;
  hasClientAccess: () => boolean;
}

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      hasHydrated: false,
      login: (user: User, token: string) => set({
        user,
        token,
        isAuthenticated: true
      }),
      logout: async () => {
        try {
          // Use relative path - Next.js rewrites will proxy to backend
          await axios.post('/api/user/logout', {}, {
            withCredentials: true
          });
        } catch (error) {
          console.error('Logout error:', error);
        }
        set({
          user: null,
          token: null,
          isAuthenticated: false
        });
      },
      checkAuth: async () => {
        try {
          const { token } = get();
          if (!token) {
            set({
              user: null,
              token: null,
              isAuthenticated: false
            });
            return;
          }

          // Use relative path - Next.js rewrites will proxy to backend
          const response = await axios.get('/api/user/me', {
            headers: {
              'Authorization': `Bearer ${token}`
            },
            withCredentials: true
          });
          const { user } = response.data;
          set({
            user,
            token,
            isAuthenticated: true
          });
        } catch (_error) {
          set({
            user: null,
            token: null,
            isAuthenticated: false
          });
        }
      },
      isQuant: () => {
        const { user } = get();
        return user?.role === 'QUANT';
      },
      isClient: () => {
        const { user } = get();
        return user?.role === 'CLIENT';
      },
      isAdmin: () => {
        const { user } = get();
        return user?.role === 'ADMIN';
      },
      hasClientAccess: () => {
        const { user } = get();
        return user?.role === 'CLIENT' || user?.role === 'ADMIN';
      }
    }),
    {
      name: 'auth-storage',
      onRehydrateStorage: () => (state) => {
        // Called after localStorage has been loaded
        if (state) {
          state.hasHydrated = true;
        }
      },
    }
  )
);