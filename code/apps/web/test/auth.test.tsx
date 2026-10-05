import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  AuthProvider,
  useAuth,
  ProtectedRoute,
  validateSafeRedirect,
  registerAuthCleanup,
  signInWithDiscord,
} from '../src/features/auth/index.js';
import App from '../src/App.js';

describe('T09 Auth Features & Guards', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    vi.restoreAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  describe('validateSafeRedirect', () => {
    it('allows valid relative paths and same-origin URLs', () => {
      expect(validateSafeRedirect('/lobby')).toBe('/lobby');
      expect(validateSafeRedirect('/')).toBe('/');
      expect(validateSafeRedirect('/teams?id=123')).toBe('/teams?id=123');
      expect(validateSafeRedirect(window.location.origin + '/dashboard')).toBe('/dashboard');
    });

    it('rejects foreign domains, protocol-relative, and dangerous URI schemes', () => {
      expect(validateSafeRedirect('https://evil.com/phish')).toBe('/');
      expect(validateSafeRedirect('//evil.com')).toBe('/');
      expect(validateSafeRedirect('javascript:alert(1)')).toBe('/');
      expect(validateSafeRedirect('data:text/html,<script>alert(1)</script>')).toBe('/');
      expect(validateSafeRedirect('http://malicious.org')).toBe('/');
    });
  });

  describe('Discord OAuth sign-in API trigger', () => {
    it('sends POST /api/auth/sign-in/social with provider discord and safe callback URLs', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ url: 'https://discord.com/oauth2/authorize?test=1', redirect: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const targetUrl = await signInWithDiscord('/lobby');

      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/auth/sign-in/social',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            provider: 'discord',
            callbackURL: `${window.location.origin}/lobby`,
            errorCallbackURL: `${window.location.origin}/login?error=oauth_denied`,
          }),
        })
      );
      expect(targetUrl).toBe('https://discord.com/oauth2/authorize?test=1');
    });
  });

  describe('Session loading privacy', () => {
    it('does not render protected child components while session query is pending', () => {
      // Pending request mock (never resolves during sync render)
      vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}));

      render(
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <MemoryRouter initialEntries={['/protected']}>
              <Routes>
                <Route
                  path="/protected"
                  element={
                    <ProtectedRoute>
                      <div data-testid="private-content">SECRET DATA</div>
                    </ProtectedRoute>
                  }
                />
              </Routes>
            </MemoryRouter>
          </AuthProvider>
        </QueryClientProvider>
      );

      expect(screen.queryByTestId('private-content')).not.toBeInTheDocument();
      expect(screen.getByTestId('auth-loading-spinner')).toBeInTheDocument();
    });
  });

  describe('Denied OAuth / Error state and recovery', () => {
    it('displays error UI when OAuth returns error parameter or API fails, allowing retry', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 })
      );

      render(
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <MemoryRouter initialEntries={['/login?error=oauth_denied']}>
              <App />
            </MemoryRouter>
          </AuthProvider>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('oauth-error-banner')).toBeInTheDocument();
      });

      expect(screen.getByText(/Đăng nhập Discord bị hủy hoặc thất bại/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Thử lại/i })).toBeInTheDocument();
    });
  });

  describe('Guest access & CTA', () => {
    it('allows guest to view public lobby shell with Discord login CTA', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 })
      );

      render(
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <MemoryRouter initialEntries={['/']}>
              <App />
            </MemoryRouter>
          </AuthProvider>
        </QueryClientProvider>
      );

      await waitFor(() => {
        const ctas = screen.getAllByTestId('guest-login-cta');
        expect(ctas.length).toBeGreaterThan(0);
        expect(ctas[0]).toBeInTheDocument();
      });

      expect(screen.getAllByText(/Đăng nhập bằng Discord/i).length).toBeGreaterThan(0);
    });
  });

  describe('Network / 403 failure closes protected routes', () => {
    it('fails closed when /me returns 403 or network error, displaying error/login prompt', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'Forbidden' }), { status: 403 })
      );

      render(
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <MemoryRouter initialEntries={['/protected']}>
              <Routes>
                <Route
                  path="/protected"
                  element={
                    <ProtectedRoute>
                      <div data-testid="private-content">SECRET DATA</div>
                    </ProtectedRoute>
                  }
                />
              </Routes>
            </MemoryRouter>
          </AuthProvider>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.queryByTestId('private-content')).not.toBeInTheDocument();
        expect(screen.getByTestId('auth-error-state')).toBeInTheDocument();
      });
    });
  });

  describe('Logout lifecycle, React Query invalidation and Socket/Call cleanup', () => {
    it('waits for server POST /api/auth/sign-out, invalidates cache and triggers registered cleanup callbacks', async () => {
      const mockUser = {
        id: 'usr_123',
        displayName: 'Test Gamer',
        avatarUrl: 'https://cdn.discordapp.com/avatars/1/2.png',
        email: 'test@fg.vn',
        emailVerified: true,
        discordId: 'discord_999',
        customStatus: 'JUST_CHATTING',
        createdAt: '2026-10-05T00:00:00.000Z',
        updatedAt: '2026-10-05T00:00:00.000Z',
      };

      let isAuthenticated = true;
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
        const urlStr = url.toString();
        if (urlStr.includes('/api/v1/me')) {
          if (!isAuthenticated) {
            return new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 });
          }
          return new Response(JSON.stringify(mockUser), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (urlStr.includes('/api/auth/sign-out')) {
          isAuthenticated = false;
          return new Response(JSON.stringify({ success: true }), { status: 200 });
        }
        return new Response(null, { status: 404 });
      });

      const cleanupSocketSpy = vi.fn();
      const cleanupCallSpy = vi.fn();
      const unregisterSocket = registerAuthCleanup(cleanupSocketSpy);
      const unregisterCall = registerAuthCleanup(cleanupCallSpy);

      function TestComponent() {
        const { user, signOut, isSigningOut } = useAuth();
        return (
          <div>
            <div data-testid="user-name">{user ? user.displayName : 'NO_USER'}</div>
            <button onClick={() => signOut()} disabled={isSigningOut}>
              Sign Out
            </button>
          </div>
        );
      }

      render(
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <TestComponent />
          </AuthProvider>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('user-name')).toHaveTextContent('Test Gamer');
      });

      fireEvent.click(screen.getByRole('button', { name: /Sign Out/i }));

      await waitFor(() => {
        expect(cleanupSocketSpy).toHaveBeenCalledTimes(1);
        expect(cleanupCallSpy).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId('user-name')).toHaveTextContent('NO_USER');
      });

      unregisterSocket();
      unregisterCall();
    });
  });

  describe('Stale async /me response race condition prevention', () => {
    it('ignores slow in-flight /me request that resolves after logout', async () => {
      let resolveMeRequest: (res: Response) => void;
      const mePromise = new Promise<Response>((resolve) => {
        resolveMeRequest = resolve;
      });

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
        const urlStr = url.toString();
        if (urlStr.includes('/api/v1/me')) {
          return mePromise;
        }
        if (urlStr.includes('/api/auth/sign-out')) {
          return new Response(JSON.stringify({ success: true }), { status: 200 });
        }
        return new Response(null, { status: 404 });
      });

      const mockUser = {
        id: 'usr_slow',
        displayName: 'Slow User',
        avatarUrl: null,
        email: 'slow@fg.vn',
        emailVerified: true,
        discordId: 'discord_slow',
        customStatus: 'JUST_CHATTING',
        createdAt: '2026-10-05T00:00:00.000Z',
        updatedAt: '2026-10-05T00:00:00.000Z',
      };

      function TestComponent() {
        const { user, signOut } = useAuth();
        return (
          <div>
            <div data-testid="status">{user ? user.displayName : 'LOGGED_OUT'}</div>
            <button onClick={() => signOut()}>Force Logout</button>
          </div>
        );
      }

      render(
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <TestComponent />
          </AuthProvider>
        </QueryClientProvider>
      );

      // Trigger logout while /me is still pending
      fireEvent.click(screen.getByRole('button', { name: /Force Logout/i }));

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('LOGGED_OUT');
      });

      // Now resolve the stale /me request
      resolveMeRequest!(
        new Response(JSON.stringify(mockUser), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      // Wait a tick to ensure state didn't get overwritten
      await new Promise((r) => setTimeout(r, 50));

      expect(screen.getByTestId('status')).toHaveTextContent('LOGGED_OUT');
    });
  });
});
