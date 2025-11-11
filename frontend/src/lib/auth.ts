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
  refreshIntervalId: NodeJS.Timeout | null;
  login: (user: User, token: string) => void;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  startPeriodicRefresh: () => void;
  stopPeriodicRefresh: () => void;
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
      refreshIntervalId: null,
      login: (user: User, token: string) => set({
        user,
        token,
        isAuthenticated: true
      }),
      logout: async () => {
        // Stop periodic refresh
        get().stopPeriodicRefresh();

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
      },
      startPeriodicRefresh: () => {
        const state = get();

        // Don't start if already running or not authenticated
        if (state.refreshIntervalId || !state.isAuthenticated) {
          return;
        }

        // Refresh every 5 minutes (300000ms)
        const intervalId = setInterval(() => {
          const currentState = get();
          if (currentState.isAuthenticated && currentState.token) {
            currentState.checkAuth();
          } else {
            // Stop if no longer authenticated
            currentState.stopPeriodicRefresh();
          }
        }, 5 * 60 * 1000);

        set({ refreshIntervalId: intervalId });
        console.log('[Auth] Periodic refresh started (every 5 minutes)');
      },
      stopPeriodicRefresh: () => {
        const { refreshIntervalId } = get();
        if (refreshIntervalId) {
          clearInterval(refreshIntervalId);
          set({ refreshIntervalId: null });
          console.log('[Auth] Periodic refresh stopped');
        }
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