import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import axios from 'axios';

interface User {
  id: string;
  email: string;
  createdAt: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (user: User, token: string) => void;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      login: (user: User, token: string) => set({
        user,
        token,
        isAuthenticated: true
      }),
      logout: async () => {
        try {
          await axios.post(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/auth/logout`, {}, {
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

          const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/auth/me`, {
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
        } catch (error) {
          set({
            user: null,
            token: null,
            isAuthenticated: false
          });
        }
      }
    }),
    {
      name: 'auth-storage',
    }
  )
);