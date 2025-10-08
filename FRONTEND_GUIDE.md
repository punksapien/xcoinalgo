# Frontend Implementation Guide

## Table of Contents
1. [Project Structure](#project-structure)
2. [Next.js App Router](#nextjs-app-router)
3. [React Patterns](#react-patterns)
4. [State Management](#state-management)
5. [API Integration](#api-integration)
6. [Component Architecture](#component-architecture)
7. [Styling with Tailwind](#styling-with-tailwind)
8. [Type Safety](#type-safety)

---

## Project Structure

```
frontend/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── dashboard/
│   │   │   ├── strategies/     # Strategy listing
│   │   │   ├── strategy/[id]/  # Strategy detail
│   │   │   ├── subscriptions/  # User subscriptions
│   │   │   ├── subscription/[id]/ # Subscription detail
│   │   │   ├── broker/         # Broker setup
│   │   │   └── page.tsx        # Dashboard home
│   │   ├── login/              # Login page
│   │   ├── register/           # Registration page
│   │   └── layout.tsx          # Root layout
│   ├── components/
│   │   ├── layout/             # Layout components
│   │   │   ├── dashboard-layout.tsx
│   │   │   └── sidebar.tsx
│   │   ├── strategy/           # Strategy-related components
│   │   │   └── subscribe-modal.tsx
│   │   └── ui/                 # Shadcn/ui components
│   │       ├── button.tsx
│   │       ├── card.tsx
│   │       └── ...
│   └── lib/
│       ├── api/
│       │   └── strategy-execution-api.ts  # API client
│       ├── auth.ts             # Auth state (Zustand)
│       ├── theme.ts            # Theme state (Zustand)
│       └── utils.ts            # Utilities
├── public/                     # Static assets
└── package.json
```

### Why This Structure?

**App Router Benefits:**
- File-system based routing
- Server components by default
- Nested layouts
- Loading and error states

**Component Organization:**
- `app/`: Pages and routes
- `components/`: Reusable UI components
- `lib/`: Business logic, API clients, state

---

## Next.js App Router

### File-Based Routing

Next.js 14 uses file-system routing with the App Router:

```
app/
├── page.tsx                    → /
├── layout.tsx                  → Root layout
├── login/
│   └── page.tsx                → /login
├── dashboard/
│   ├── page.tsx                → /dashboard
│   ├── strategies/
│   │   └── page.tsx            → /dashboard/strategies
│   └── strategy/
│       └── [id]/
│           └── page.tsx        → /dashboard/strategy/:id
```

**Key Files:**

1. **page.tsx** - Page component
2. **layout.tsx** - Shared layout
3. **loading.tsx** - Loading state
4. **error.tsx** - Error boundary

### Server vs Client Components

**Server Components (default):**
```typescript
// This runs on the server
export default async function Page() {
  const data = await fetch('https://api.example.com/data');
  return <div>{data}</div>;
}
```

**Client Components:**
```typescript
'use client'; // Required directive

import { useState } from 'react';

export default function Page() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
```

**When to use 'use client':**
- Need React hooks (useState, useEffect, etc.)
- Event handlers (onClick, onChange, etc.)
- Browser APIs (localStorage, window, etc.)
- Third-party libraries that use hooks

**Our pages use 'use client' because:**
- Authentication state (useAuth hook)
- Interactive forms and buttons
- Real-time updates (useEffect polling)

### Dynamic Routes

**File:** `app/dashboard/strategy/[id]/page.tsx`

```typescript
'use client';

import { useParams } from 'next/navigation';

export default function StrategyDetailPage() {
  const params = useParams();
  const strategyId = params.id as string;

  // Fetch strategy with this ID
  // ...
}
```

**How it works:**
1. User visits `/dashboard/strategy/abc123`
2. Next.js matches the `[id]` route
3. `params.id` = `"abc123"`
4. Component can use this to fetch data

### Layouts

**File:** `app/dashboard/layout.tsx`

```typescript
import { DashboardLayout } from '@/components/layout/dashboard-layout';

export default function Layout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
```

**Benefits:**
- Sidebar only renders once
- Shared across all dashboard pages
- Preserves state during navigation

---

## React Patterns

### 1. Custom Hooks

Custom hooks encapsulate reusable logic.

**Example: useAuth Hook**

**File:** `src/lib/auth.ts`

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
  logout: () => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,

      login: (user, token) => {
        set({ user, token, isAuthenticated: true });
      },

      logout: () => {
        set({ user: null, token: null, isAuthenticated: false });
      },
    }),
    {
      name: 'auth-storage', // localStorage key
    }
  )
);
```

**Usage:**

```typescript
'use client';

import { useAuth } from '@/lib/auth';

export default function Component() {
  const { user, token, isAuthenticated, login, logout } = useAuth();

  if (!isAuthenticated) {
    return <div>Please login</div>;
  }

  return <div>Welcome, {user?.email}</div>;
}
```

**Why Custom Hooks?**
- Reusable across components
- Clean separation of concerns
- Easy to test
- Type-safe

### 2. Compound Components

Components that work together.

**Example: Modal Component**

```typescript
// subscribe-modal.tsx
export function SubscribeModal({
  open,
  onOpenChange,
  strategyId,
  strategyName,
  onSuccess
}: SubscribeModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Subscribe to Strategy</DialogTitle>
          <DialogDescription>
            Configure your subscription for {strategyName}
          </DialogDescription>
        </DialogHeader>

        {/* Form fields */}

        <DialogFooter>
          <Button onClick={handleSubscribe}>Subscribe</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**Pattern:**
- Parent component manages state (open/closed)
- Child component handles display and interactions
- Callbacks communicate back to parent

### 3. Conditional Rendering

**Loading States:**

```typescript
if (loading) {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    </div>
  );
}
```

**Empty States:**

```typescript
if (strategies.length === 0) {
  return (
    <Card>
      <CardContent className="text-center py-12">
        <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3>No strategies found</h3>
        <p>Upload your first strategy to get started</p>
        <Button onClick={() => router.push('/upload')}>
          Upload Strategy
        </Button>
      </CardContent>
    </Card>
  );
}
```

**Error States:**

```typescript
if (error) {
  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  );
}
```

### 4. Data Fetching Pattern

**Standard pattern we use:**

```typescript
'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';

export default function Page() {
  const { token } = useAuth();
  const [data, setData] = useState<Data[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, [token]); // Re-fetch when token changes

  const fetchData = async () => {
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const response = await fetch('/api/endpoint', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch');
      }

      const json = await response.json();
      setData(json.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  };

  // Render based on state
  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} />;
  return <DataDisplay data={data} />;
}
```

**Key Points:**
1. **Three states:** loading, error, data
2. **useEffect:** Runs on mount and when dependencies change
3. **try-catch:** Handle errors gracefully
4. **finally:** Always runs (good for setLoading(false))

### 5. Form Handling

```typescript
export function SubscribeModal() {
  const [capital, setCapital] = useState('10000');
  const [riskPerTrade, setRiskPerTrade] = useState('0.02');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    // Validation
    if (!capital || parseFloat(capital) <= 0) {
      setError('Capital must be greater than 0');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const config = {
        capital: parseFloat(capital),
        riskPerTrade: parseFloat(riskPerTrade),
        // ... other fields
      };

      await api.subscribeToStrategy(strategyId, config, token);

      // Success
      onSuccess?.();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to subscribe');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <div>
            <Label htmlFor="capital">Capital ($)</Label>
            <Input
              id="capital"
              type="number"
              value={capital}
              onChange={(e) => setCapital(e.target.value)}
              disabled={loading}
            />
          </div>

          <div>
            <Label htmlFor="risk">Risk Per Trade</Label>
            <Input
              id="risk"
              type="number"
              step="0.001"
              value={riskPerTrade}
              onChange={(e) => setRiskPerTrade(e.target.value)}
              disabled={loading}
            />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? 'Subscribing...' : 'Subscribe'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**Best Practices:**
1. Controlled inputs (value + onChange)
2. Validation before submission
3. Loading state disables form
4. Error display at top of form
5. Success callback to parent

---

## State Management

### Zustand for Global State

We use Zustand instead of Redux because:
- **Simpler:** Less boilerplate
- **Performant:** Only re-renders components that use changed state
- **Type-safe:** Full TypeScript support
- **Persistent:** Easy localStorage integration

### Auth Store

**File:** `src/lib/auth.ts`

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
  logout: () => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      // Initial state
      user: null,
      token: null,
      isAuthenticated: false,

      // Actions
      login: (user, token) => {
        set({ user, token, isAuthenticated: true });
      },

      logout: () => {
        set({ user: null, token: null, isAuthenticated: false });
      },
    }),
    {
      name: 'auth-storage', // localStorage key
    }
  )
);
```

**How persist middleware works:**
1. Saves state to localStorage on every change
2. Loads state from localStorage on app start
3. Survives page refreshes

**Usage in components:**

```typescript
// Read state
const { user, token, isAuthenticated } = useAuth();

// Call actions
const { login, logout } = useAuth();
login(user, token);

// Select specific fields (optimization)
const token = useAuth(state => state.token);
// Only re-renders when token changes
```

### Theme Store

**File:** `src/lib/theme.ts`

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ThemeState {
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (isDark: boolean) => void;
}

export const useTheme = create<ThemeState>()(
  persist(
    (set, get) => ({
      isDark: false,

      toggleTheme: () => {
        const newTheme = !get().isDark;
        set({ isDark: newTheme });

        // Update DOM
        if (newTheme) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      },

      setTheme: (isDark) => {
        set({ isDark });

        if (isDark) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      },
    }),
    {
      name: 'theme-storage',
    }
  )
);
```

**Side Effects in Actions:**
```typescript
toggleTheme: () => {
  const newTheme = !get().isDark;
  set({ isDark: newTheme });

  // Side effect: Update DOM
  document.documentElement.classList.toggle('dark', newTheme);
}
```

### Local State vs Global State

**Use Local State (useState) when:**
- State only used in one component
- Temporary UI state (modals, dropdowns)
- Form inputs

**Use Global State (Zustand) when:**
- State shared across multiple components
- Needs to persist (localStorage)
- Authentication/theme

**Example:**

```typescript
// Local state
const [searchTerm, setSearchTerm] = useState('');

// Global state
const { token } = useAuth();
```

---

## API Integration

### API Client Pattern

**File:** `src/lib/api/strategy-execution-api.ts`

```typescript
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Helper function for auth headers
function getAuthHeaders(token: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
}

// Helper function for error handling
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || error.message || 'Request failed');
  }
  return response.json();
}

export class StrategyExecutionAPI {
  // Subscribe to strategy
  static async subscribeToStrategy(
    strategyId: string,
    config: SubscriptionConfig,
    token: string
  ): Promise<{ message: string; subscription: any }> {
    const response = await fetch(`${API_BASE_URL}/api/strategies/${strategyId}/subscribe`, {
      method: 'POST',
      headers: getAuthHeaders(token),
      body: JSON.stringify(config),
    });

    return handleResponse(response);
  }

  // Get user subscriptions
  static async getUserSubscriptions(
    token: string
  ): Promise<{ subscriptions: Subscription[] }> {
    const response = await fetch(`${API_BASE_URL}/api/strategies/subscriptions`, {
      method: 'GET',
      headers: getAuthHeaders(token),
    });

    return handleResponse(response);
  }

  // Pause subscription
  static async pauseSubscription(
    subscriptionId: string,
    token: string
  ): Promise<{ message: string }> {
    const response = await fetch(`${API_BASE_URL}/api/strategies/subscriptions/${subscriptionId}/pause`, {
      method: 'POST',
      headers: getAuthHeaders(token),
    });

    return handleResponse(response);
  }

  // ... more methods
}
```

**Why Static Class Methods?**
- No need to instantiate (`new StrategyExecutionAPI()`)
- Namespace for related functions
- Easy to mock in tests

**Usage in Components:**

```typescript
import { StrategyExecutionAPI } from '@/lib/api/strategy-execution-api';

export default function Component() {
  const { token } = useAuth();

  const handleSubscribe = async () => {
    try {
      await StrategyExecutionAPI.subscribeToStrategy(strategyId, config, token!);
      // Success
    } catch (error) {
      // Handle error
    }
  };
}
```

### TypeScript Interfaces

**Define response types:**

```typescript
export interface Subscription {
  id: string;
  userId: string;
  strategyId: string;
  capital: number;
  riskPerTrade: number;
  leverage: number;
  maxPositions: number;
  maxDailyLoss: number;
  slAtrMultiplier?: number;
  tpAtrMultiplier?: number;
  brokerCredentialId: string;
  isActive: boolean;
  isPaused: boolean;
  subscribedAt: string;
  pausedAt?: string;
  unsubscribedAt?: string;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  totalPnl: number;
  strategy?: {
    id: string;
    name: string;
    executionConfig: any;
  };
}

export interface SubscriptionConfig {
  capital: number;
  riskPerTrade: number;
  leverage?: number;
  maxPositions?: number;
  maxDailyLoss?: number;
  slAtrMultiplier?: number;
  tpAtrMultiplier?: number;
  brokerCredentialId: string;
}
```

**Benefits:**
- Autocomplete in IDE
- Compile-time type checking
- Prevents typos
- Self-documenting

---

## Component Architecture

### Component Hierarchy

```
DashboardLayout
├── Sidebar
│   ├── Navigation Links
│   ├── Theme Toggle
│   └── User Profile
└── Main Content
    └── Page Component
        ├── Header
        ├── Filters
        ├── Data Grid/List
        └── Modals
```

### DashboardLayout Component

**File:** `src/components/layout/dashboard-layout.tsx`

```typescript
'use client';

import { useState } from 'react';
import { Sidebar } from './sidebar';
import { Menu } from 'lucide-react';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen bg-background">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-50
          w-64 transform transition-transform duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <Sidebar onNavigate={() => setSidebarOpen(false)} />
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {/* Mobile menu button */}
        <div className="lg:hidden p-4">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-md hover:bg-accent"
          >
            <Menu className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
```

**Responsive Design:**
- Desktop: Sidebar always visible
- Mobile: Sidebar hidden, opens with menu button
- Backdrop closes sidebar when clicked

### Sidebar Component

**File:** `src/components/layout/sidebar.tsx`

```typescript
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { Bot, Activity, CreditCard, BarChart3, LogOut, Moon, Sun } from 'lucide-react';

const navigation = [
  { name: 'Strategies', href: '/dashboard/strategies', icon: Bot },
  { name: 'My Subscriptions', href: '/dashboard/subscriptions', icon: Activity },
  { name: 'Broker Setup', href: '/dashboard/broker', icon: CreditCard },
  { name: 'Positions & Orders', href: '/dashboard/positions', icon: BarChart3 },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();

  return (
    <div className="flex flex-col h-full bg-sidebar border-r">
      {/* Logo & Theme Toggle */}
      <div className="flex items-center justify-between h-16 px-4 border-b">
        <span className="text-xl font-bold">XcoinAlgo</span>
        <button onClick={toggleTheme} className="p-2 rounded-lg hover:bg-accent">
          {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-2">
        {navigation.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={onNavigate}
              className={`
                flex items-center px-4 py-3 rounded-lg transition-colors
                ${isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-accent'
                }
              `}
            >
              <item.icon className="h-5 w-5 mr-3" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* User Profile */}
      <div className="p-4 border-t">
        <div className="flex items-center space-x-3 mb-3">
          <div className="h-8 w-8 bg-primary/10 rounded-full flex items-center justify-center">
            <span className="text-sm font-medium">
              {user?.email?.charAt(0).toUpperCase()}
            </span>
          </div>
          <p className="text-sm font-medium truncate">{user?.email}</p>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center justify-center px-3 py-2 rounded-lg hover:bg-accent"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sign out
        </button>
      </div>
    </div>
  );
}
```

**Key Features:**
1. **Active state:** Highlights current page
2. **Icons:** Visual navigation cues
3. **Theme toggle:** Switches dark/light mode
4. **User profile:** Shows email and logout button

### Page Component Structure

```typescript
export default function StrategiesPage() {
  // 1. Hooks (always at top)
  const { token } = useAuth();
  const router = useRouter();

  // 2. State
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // 3. Effects
  useEffect(() => {
    fetchStrategies();
  }, [searchTerm, token]);

  // 4. Event handlers
  const handleSearch = (term: string) => {
    setSearchTerm(term);
  };

  const handleSubscribe = async (strategyId: string) => {
    // ...
  };

  // 5. Computed values
  const filteredStrategies = strategies.filter(s =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // 6. Render
  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} />;

  return (
    <div>
      <Header />
      <SearchBar value={searchTerm} onChange={handleSearch} />
      <StrategyGrid strategies={filteredStrategies} />
    </div>
  );
}
```

**Organization:**
1. Hooks first (React rule)
2. State declarations
3. Side effects (useEffect)
4. Event handlers
5. Computed/derived values
6. Render logic

---

## Styling with Tailwind

### Utility-First CSS

Instead of writing CSS:

```css
.button {
  padding: 0.5rem 1rem;
  background-color: blue;
  color: white;
  border-radius: 0.25rem;
}
```

Use utility classes:

```typescript
<button className="px-4 py-2 bg-blue-500 text-white rounded">
  Click me
</button>
```

**Benefits:**
- No naming classes
- No context switching (HTML ↔ CSS)
- Easy to see what styles apply
- Automatic purging of unused styles

### Responsive Design

Tailwind makes responsive design easy:

```typescript
<div className="
  grid
  grid-cols-1          // 1 column on mobile
  md:grid-cols-2       // 2 columns on tablet
  lg:grid-cols-3       // 3 columns on desktop
  gap-6
">
  {strategies.map(strategy => (
    <StrategyCard key={strategy.id} strategy={strategy} />
  ))}
</div>
```

**Breakpoints:**
- `sm:` - 640px and up
- `md:` - 768px and up
- `lg:` - 1024px and up
- `xl:` - 1280px and up

### Dark Mode

Tailwind supports dark mode out of the box:

```typescript
<div className="
  bg-white dark:bg-gray-900
  text-gray-900 dark:text-white
">
  Content
</div>
```

**How we enable it:**

```typescript
// tailwind.config.ts
export default {
  darkMode: 'class', // Use class strategy
  // ...
}

// Then toggle with JS
document.documentElement.classList.toggle('dark');
```

### Custom Styles with cn() Utility

**File:** `src/lib/utils.ts`

```typescript
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

**Usage:**

```typescript
const buttonVariants = {
  primary: 'bg-blue-500 text-white',
  secondary: 'bg-gray-200 text-gray-900',
};

<button
  className={cn(
    'px-4 py-2 rounded', // Base styles
    buttonVariants[variant], // Variant styles
    disabled && 'opacity-50 cursor-not-allowed', // Conditional
    className // Allow override from props
  )}
>
  {children}
</button>
```

**Why cn()?**
- Merges class names intelligently
- Handles conflicts (last one wins)
- Conditional classes
- Accepts arrays, objects, strings

### Shadcn/ui Components

We use shadcn/ui for pre-built components:

```typescript
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

<Card>
  <CardHeader>
    <CardTitle>Strategy Details</CardTitle>
  </CardHeader>
  <CardContent>
    <p>Content here</p>
    <Button>Subscribe</Button>
  </CardContent>
</Card>
```

**Why shadcn/ui?**
- Copy-paste into your project (not npm package)
- Fully customizable
- Built with Tailwind
- Accessible by default

---

## Type Safety

### Component Props Types

```typescript
interface StrategyCardProps {
  strategy: Strategy;
  onSubscribe: (strategyId: string) => void;
  showActions?: boolean; // Optional prop
}

export function StrategyCard({ strategy, onSubscribe, showActions = true }: StrategyCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{strategy.name}</CardTitle>
      </CardHeader>
      <CardContent>
        {showActions && (
          <Button onClick={() => onSubscribe(strategy.id)}>
            Subscribe
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
```

**Benefits:**
- IDE autocomplete
- Catch errors at compile time
- Self-documenting
- Refactoring safety

### Generic Types

```typescript
// Generic API response
interface ApiResponse<T> {
  data: T;
  error?: string;
}

// Usage
type StrategiesResponse = ApiResponse<Strategy[]>;
type SubscriptionResponse = ApiResponse<Subscription>;

// Function with generics
async function fetchData<T>(url: string): Promise<T> {
  const response = await fetch(url);
  return response.json();
}

// Type inferred from usage
const strategies = await fetchData<Strategy[]>('/api/strategies');
```

### Type Guards

```typescript
// Check if value is defined
if (subscription) {
  // TypeScript knows subscription is not null here
  console.log(subscription.capital);
}

// Type guard function
function isError(value: unknown): value is Error {
  return value instanceof Error;
}

try {
  // ...
} catch (err) {
  if (isError(err)) {
    console.error(err.message); // Safe to access .message
  }
}
```

### Enum vs Union Types

**Union Types (Preferred):**
```typescript
type SubscriptionStatus = 'active' | 'paused' | 'cancelled';

const status: SubscriptionStatus = 'active'; // OK
const status: SubscriptionStatus = 'invalid'; // Error
```

**Why not Enums?**
- Simpler (just strings)
- Better in JSON
- No runtime overhead

---

## Best Practices

### 1. Component Composition

**Bad:**
```typescript
function Page() {
  return (
    <div className="container">
      <div className="header">
        <h1>Strategies</h1>
        <button>Upload</button>
      </div>
      <div className="content">
        {/* 100 lines of code */}
      </div>
    </div>
  );
}
```

**Good:**
```typescript
function Page() {
  return (
    <div className="container">
      <Header />
      <Content />
    </div>
  );
}

function Header() {
  return (
    <div className="header">
      <h1>Strategies</h1>
      <UploadButton />
    </div>
  );
}
```

### 2. Extract Reusable Logic

**Bad:**
```typescript
// Repeated in multiple components
const fetchStrategies = async () => {
  const response = await fetch('/api/strategies', {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.json();
};
```

**Good:**
```typescript
// In lib/api/strategy-api.ts
export const StrategyAPI = {
  async getAll(token: string) {
    const response = await fetch('/api/strategies', {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.json();
  }
};

// In component
const strategies = await StrategyAPI.getAll(token);
```

### 3. Consistent Error Handling

```typescript
try {
  setLoading(true);
  setError(null); // Clear previous errors

  const result = await api.call();

  // Success handling
  setData(result);
} catch (err) {
  // Consistent error format
  setError(err instanceof Error ? err.message : 'Operation failed');

  // Optional: Show toast notification
  toast.error(err.message);
} finally {
  setLoading(false); // Always runs
}
```

### 4. Avoid Prop Drilling

**Problem:**
```typescript
<GrandParent token={token}>
  <Parent token={token}>
    <Child token={token} />
  </Parent>
</GrandParent>
```

**Solution:** Use Zustand for global state
```typescript
// In Child component
const { token } = useAuth();
// No need to pass through props
```

### 5. Memoization

**Expensive computation:**
```typescript
import { useMemo } from 'react';

function Component({ data }) {
  // Only recalculates when data changes
  const processedData = useMemo(() => {
    return data
      .filter(item => item.active)
      .map(item => ({ ...item, computed: expensiveOperation(item) }))
      .sort((a, b) => b.score - a.score);
  }, [data]);

  return <DataGrid data={processedData} />;
}
```

**Callbacks:**
```typescript
import { useCallback } from 'react';

function Parent() {
  // Function reference stays the same
  const handleClick = useCallback((id: string) => {
    console.log('Clicked:', id);
  }, []); // No dependencies

  return <Child onClick={handleClick} />;
}
```

---

## Summary

This frontend implements:

1. **Next.js App Router:** File-based routing, server/client components
2. **React Patterns:** Custom hooks, conditional rendering, data fetching
3. **Zustand:** Simple global state management
4. **Type Safety:** Full TypeScript coverage
5. **Tailwind CSS:** Utility-first styling, responsive design
6. **Component Architecture:** DashboardLayout, Sidebar, Pages, Modals
7. **API Integration:** Centralized API client with error handling
8. **Best Practices:** Composition, memoization, consistent patterns

**Key Files to Study:**
- `app/dashboard/strategies/page.tsx` - Complete page example
- `components/layout/dashboard-layout.tsx` - Layout pattern
- `lib/auth.ts` - Zustand store
- `lib/api/strategy-execution-api.ts` - API client
- `components/strategy/subscribe-modal.tsx` - Form handling

**Next:** Read `DEPLOYMENT.md` for production deployment guide.
