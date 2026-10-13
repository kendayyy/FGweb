import React, { createContext, useContext, useState, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MeDTO } from '@fg/contracts';
import { fetchMe, signInWithDiscord, signOutServer, validateDiscordOAuthUrl } from './api.js';
import { runAuthCleanups } from './lifecycle.js';

export interface AuthContextType {
  user: MeDTO | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  isSigningOut: boolean;
  signIn: (callbackPath?: string) => Promise<void>;
  signOut: () => Promise<void>;
  refetchUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AUTH_QUERY_KEY = ['auth', 'me'];

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const epochRef = useRef(0);

  const {
    data: meData,
    isLoading: isQueryLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: async () => {
      const currentEpoch = epochRef.current;
      const user = await fetchMe();
      if (currentEpoch !== epochRef.current) {
        // Stale response race: epoch changed during request execution, ignore!
        return null;
      }
      return user;
    },
    retry: false,
    staleTime: 1000 * 60 * 5,
  });

  const user = meData ?? null;

  const signIn = useCallback(async (callbackPath?: string) => {
    const targetUrl = await signInWithDiscord(callbackPath);
    // Validate target URL before window navigation
    const safeUrl = validateDiscordOAuthUrl(targetUrl);
    window.location.href = safeUrl;
  }, []);

  const signOut = useCallback(async () => {
    setIsSigningOut(true);
    // Advance epoch immediately to invalidate any in-flight /me request
    epochRef.current += 1;

    let serverError: Error | null = null;
    let cleanupError: Error | null = null;

    try {
      await signOutServer();
    } catch (err) {
      serverError = err instanceof Error ? err : new Error(String(err));
    }

    try {
      await runAuthCleanups();
    } catch (err) {
      cleanupError = err instanceof Error ? err : new Error(String(err));
    } finally {
      // On confirmed or attempted logout, always cancel in-flight queries and clear private cache
      await queryClient.cancelQueries();
      queryClient.clear();
      queryClient.setQueryData(AUTH_QUERY_KEY, null);
      setIsSigningOut(false);
    }

    // Report error if server logout or cleanup failed, do NOT fake success
    if (serverError) {
      throw serverError;
    }
    if (cleanupError) {
      throw cleanupError;
    }
  }, [queryClient]);

  const refetchUser = useCallback(async () => {
    await queryClient.cancelQueries({ queryKey: AUTH_QUERY_KEY });
    await refetch();
  }, [queryClient, refetch]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading: isQueryLoading,
        isError,
        error: error as Error | null,
        isSigningOut,
        signIn,
        signOut,
        refetchUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
