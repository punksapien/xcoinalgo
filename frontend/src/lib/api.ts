import axios from 'axios';
import { useAuth } from './auth';

// Use environment variables for API base URL
const API_BASE_URL = typeof window === 'undefined'
  ? (process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_URL || 'http://localhost:3001')
  : (process.env.NEXT_PUBLIC_BACKEND_URL || '');

// Create axios instance
const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Include session cookies
});

// Request interceptor to add Bearer token
api.interceptors.request.use(
  (config) => {
    const { token } = useAuth.getState();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid, logout user
      useAuth.getState().logout();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  register: (email: string, password: string) =>
    api.post('/user/register', { email, password }),

  login: (email: string, password: string) =>
    api.post('/user/login', { email, password }),
};

// Broker API
export const brokerAPI = {
  storeKeys: (apiKey: string, apiSecret: string) =>
    api.post('/broker/keys', { apiKey, apiSecret }),

  getStatus: () =>
    api.get('/broker/status'),

  deleteKeys: () =>
    api.delete('/broker/keys'),
};

// Strategy API
export const strategyAPI = {
  getStrategies: (params?: {
    search?: string;
    tags?: string;
    author?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: string;
  }) => api.get('/strategies', { params }),

  getStrategy: (id: string) =>
    api.get(`/strategies/${id}`),

  getTags: () =>
    api.get('/strategies/meta/tags'),

  getAuthors: () =>
    api.get('/strategies/meta/authors'),
};

// Bot API
export const botAPI = {
  startBot: (data: {
    strategyId: string;
    leverage?: number;
    riskPerTrade?: number;
    marginCurrency?: string;
  }) => api.post('/bot/start', data),

  stopBot: (deploymentId: string) =>
    api.post('/bot/stop', { deploymentId }),

  getDeployments: (params?: {
    status?: string;
    page?: number;
    limit?: number;
  }) => api.get('/bot/deployments', { params }),

  getDeployment: (id: string) =>
    api.get(`/bot/deployments/${id}`),

  deleteDeployment: (id: string) =>
    api.delete(`/bot/deployments/${id}`),
};

export default api;
