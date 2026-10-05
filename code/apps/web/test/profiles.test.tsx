import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../src/features/auth/index.js';
import { OnboardingForm, OnboardingPage } from '../src/features/onboarding/index.js';
import { ProfileHeader, ProfilePage, ProfileEditor } from '../src/features/profiles/index.js';
import { ProfileDTO, MeDTO } from '@fg/contracts';

describe('T11 - Profiles & Onboarding Behavioral Suite', () => {
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

  const mockUser: MeDTO = {
    id: 'user_owner_123',
    displayName: 'GamerOwner',
    email: 'owner@example.com',
    emailVerified: true,
    discordId: 'discord_owner_999',
    customStatus: 'LOOKING_FOR_TEAM',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    onboardingComplete: true,
    interestedGames: ['Valorant'],
  };

  const mockPublicProfile: ProfileDTO = {
    id: 'user_owner_123',
    displayName: 'GamerOwner',
    avatarUrl: 'https://cdn.discordapp.com/avatars/123/abc.png',
    bio: 'Competitive FPS player',
    customStatus: 'LOOKING_FOR_TEAM',
    gameProfiles: [
      {
        gameId: 'game_val_123',
        gameTitle: 'Valorant',
        inGameName: 'Owner#123',
        rank: 'Ascendant 1',
        role: 'Duelist',
        playHours: 250,
        playStyle: 'Aggressive',
      },
    ],
    createdAt: '2026-01-01T10:00:00.000Z',
  };

  const renderWithProviders = (ui: React.ReactNode, initialEntries = ['/']) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );
  };

  describe('1. Public Profile Security & Formatting', () => {
    it('public profile renders public data and omits private email and discordId', () => {
      // Include private sentinel fields in incoming test object to verify omission
      const profileWithPrivateFields = {
        ...mockPublicProfile,
        email: 'private_owner@example.com',
        discordId: 'discord_secret_123456',
      } as unknown as ProfileDTO;

      renderWithProviders(<ProfileHeader profile={profileWithPrivateFields} isOwner={true} />);

      expect(screen.getByText('GamerOwner')).toBeInTheDocument();
      expect(screen.getByText('Competitive FPS player')).toBeInTheDocument();

      // Ensure private email & discordId are NOT rendered anywhere in DOM
      expect(screen.queryByText('private_owner@example.com')).toBeNull();
      expect(screen.queryByText('discord_secret_123456')).toBeNull();
    });

    it('formats UTC createdAt date in Asia/Bangkok locale with hour 17 for 10:00:00Z', () => {
      renderWithProviders(<ProfileHeader profile={mockPublicProfile} />);

      // 2026-01-01T10:00:00.000Z is 17:00 in Asia/Bangkok (+7)
      const dateText = screen.getByTestId('profile-created-at');
      expect(dateText).toBeInTheDocument();
      expect(dateText.textContent).toMatch(/17|17:00/);
      expect(dateText.textContent).toContain('2026');
    });

    it('labels self-selected custom status separately without fabricated online badge', () => {
      renderWithProviders(<ProfileHeader profile={mockPublicProfile} />);

      const statusBadge = screen.getByTestId('profile-custom-status');
      expect(statusBadge).toHaveTextContent('Trạng thái tự chọn: Đang tìm đội');
      expect(statusBadge.textContent).not.toContain('Online');
    });
  });

  describe('2. Owner Game Profile Editor & Optional Rank Payload', () => {
    it('sends correct game edit payload with optional rank to PUT /api/v1/me/game-profiles/:gameId', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
        const urlStr = String(url);
        if(urlStr==='/api/v1/me')return new Response(JSON.stringify(mockUser),{status:200});
        if (urlStr.includes('/api/v1/games')) {
          return new Response(
            JSON.stringify([
              { id: 'game_val_123', title: 'Valorant', lobbyRoomId: 'lobby_val_room' },
            ]),
            { status: 200 },
          );
        }
        if (urlStr.includes('/api/v1/me/game-profiles/game_val_123')) {
          return new Response(
            JSON.stringify({
              gameId: 'game_val_123',
              gameTitle: 'Valorant',
              inGameName: 'NewTag#999',
              rank: 'Radiant',
              role: 'Duelist',
              playHours: 300,
              playStyle: 'Entry',
            }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify({}), { status: 404 });
      });

      renderWithProviders(<ProfileEditor gameId="game_val_123" gameTitle="Valorant" />);
      await waitFor(()=>expect(queryClient.getQueryData(['auth','me'])).toMatchObject({id:mockUser.id}));

      const ignInput = screen.getByLabelText(/tên trong game/i);
      const rankInput = screen.getByLabelText(/rank/i);
      const hoursInput = screen.getByLabelText(/giờ chơi/i);

      fireEvent.change(ignInput, { target: { value: 'NewTag#999' } });
      fireEvent.change(rankInput, { target: { value: 'Radiant' } });
      fireEvent.change(hoursInput, { target: { value: '300' } });

      const saveBtn = screen.getByRole('button', { name: /lưu/i });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          expect.stringContaining('/api/v1/me/game-profiles/game_val_123'),
          expect.objectContaining({
            method: 'PUT',
            body: expect.stringContaining('"rank":"Radiant"'),
          }),
        );
      });
    });

    it('allows leaving rank empty when saving game profile (optional rank, rank omitted from payload)', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
        if(String(url)==='/api/v1/me')return new Response(JSON.stringify(mockUser),{status:200});
        if (String(url).includes('/api/v1/me/game-profiles/game_val_123')) {
          return new Response(
            JSON.stringify({
              gameId: 'game_val_123',
              gameTitle: 'Valorant',
              inGameName: 'CasualPlayer',
            }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify([]), { status: 200 });
      });

      renderWithProviders(<ProfileEditor gameId="game_val_123" gameTitle="Valorant" />);
      await waitFor(()=>expect(queryClient.getQueryData(['auth','me'])).toMatchObject({id:mockUser.id}));

      const ignInput = screen.getByLabelText(/tên trong game/i);
      fireEvent.change(ignInput, { target: { value: 'CasualPlayer' } });

      const saveBtn = screen.getByRole('button', { name: /lưu/i });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalled();
        const callArgs = fetchSpy.mock.calls.find((call) => String(call[0]).includes('/api/v1/me/game-profiles/game_val_123'));
        expect(callArgs).toBeDefined();
        const bodyStr = String(callArgs?.[1]?.body);
        const parsedBody = JSON.parse(bodyStr);
        expect(parsedBody.rank).toBeUndefined();
      });
    });

    it('failed saves keep form inputs intact and display error message', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
        if(String(url)==='/api/v1/me')return new Response(JSON.stringify(mockUser),{status:200});
        return new Response(JSON.stringify({ message: 'Server Save Error' }), { status: 500 });
      });

      renderWithProviders(<ProfileEditor gameId="game_val_123" gameTitle="Valorant" />);
      await waitFor(()=>expect(queryClient.getQueryData(['auth','me'])).toMatchObject({id:mockUser.id}));

      const ignInput = screen.getByLabelText(/tên trong game/i) as HTMLInputElement;
      fireEvent.change(ignInput, { target: { value: 'UnsavedInput' } });

      const saveBtn = screen.getByRole('button', { name: /lưu/i });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Server Save Error');
      });

      // Verify input value was NOT wiped out
      expect(ignInput.value).toBe('UnsavedInput');
    });
  });

  describe('3. Loading, Error & Guest vs Owner Profile Page States', () => {
    it('displays loading spinner while profile query is in flight', () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}));

      renderWithProviders(
        <Routes>
          <Route path="/users/:id" element={<ProfilePage />} />
        </Routes>,
        ['/users/user_123'],
      );

      expect(screen.getByTestId('profile-loading-spinner')).toBeInTheDocument();
    });

    it('displays error card with retry button when profile query fails', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ message: 'User profile not found' }), { status: 404 }),
      );

      renderWithProviders(
        <Routes>
          <Route path="/users/:id" element={<ProfilePage />} />
        </Routes>,
        ['/users/non_existent_123'],
      );

      await waitFor(() => {
        expect(screen.getByTestId('profile-error-state')).toBeInTheDocument();
      });
    });

    it('hides edit controls when guest views public profile', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
        const urlStr = String(url);
        if (urlStr.includes('/api/v1/me')) {
          return new Response(JSON.stringify(null), { status: 401 });
        }
        if (urlStr.includes('/api/v1/users/user_owner_123/profile')) {
          return new Response(JSON.stringify(mockPublicProfile), { status: 200 });
        }
        return new Response(JSON.stringify([]), { status: 200 });
      });

      renderWithProviders(
        <Routes>
          <Route path="/users/:id" element={<ProfilePage />} />
        </Routes>,
        ['/users/user_owner_123'],
      );

      await waitFor(() => {
        expect(screen.getByText('GamerOwner')).toBeInTheDocument();
      });

      expect(screen.queryByRole('button', { name: /chỉnh sửa/i })).toBeNull();
    });
  });

  describe('4. Server Onboarding States & Integration Error Handling', () => {
    it('renders onboarding form for authenticated user with onboardingComplete === false', async () => {
      const incompleteUser: MeDTO = {
        ...mockUser,
        onboardingComplete: false,
      };

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
        if (String(url).includes('/api/v1/me')) {
          return new Response(JSON.stringify(incompleteUser), { status: 200 });
        }
        return new Response(JSON.stringify([]), { status: 200 });
      });

      renderWithProviders(
        <Routes>
          <Route path="/onboarding" element={<OnboardingPage />} />
        </Routes>,
        ['/onboarding'],
      );

      await waitFor(() => {
        expect(screen.getByTestId('onboarding-form')).toBeInTheDocument();
      });
    });

    it('renders integration error state with retry when onboardingComplete is missing/undefined', async () => {
      const missingStatusUser = {
        id: 'user_123',
        displayName: 'NoStatusUser',
        email: 'test@example.com',
        emailVerified: true,
        discordId: '123',
        customStatus: 'JUST_CHATTING',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        // onboardingComplete is missing/undefined!
      };

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
        if (String(url).includes('/api/v1/me')) {
          return new Response(JSON.stringify(missingStatusUser), { status: 200 });
        }
        return new Response(JSON.stringify([]), { status: 200 });
      });

      renderWithProviders(
        <Routes>
          <Route path="/onboarding" element={<OnboardingPage />} />
        </Routes>,
        ['/onboarding'],
      );

      await waitFor(() => {
        expect(screen.getByTestId('onboarding-error-state')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /thử lại/i })).toBeInTheDocument();
      });
    });

    it('submitting onboarding requires >= 1 game and triggers POST /api/v1/me/onboarding', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
        if(String(url)==='/api/v1/me')return new Response(JSON.stringify(mockUser),{status:200});
        if (String(url).includes('/api/v1/me/onboarding')) {
          return new Response(
            JSON.stringify({
              id: mockUser.id,
              createdAt:mockPublicProfile.createdAt,
              displayName: 'NewGamer',
              email: 'test@example.com',
              discordId: '123',
              emailVerified: true,
            }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify([]), { status: 200 });
      });

      renderWithProviders(<OnboardingForm defaultDisplayName="NewGamer" />);
      await waitFor(()=>expect(queryClient.getQueryData(['auth','me'])).toMatchObject({id:mockUser.id}));

      const submitBtn = screen.getByRole('button', { name: /hoàn tất/i });

      // Attempt submit without game selection -> blocked by validation
      fireEvent.click(submitBtn);
      expect(screen.getByText(/chọn ít nhất 1 game/i)).toBeInTheDocument();

      // Select a game ("Valorant")
      const valorantCheckbox = screen.getByLabelText(/valorant/i);
      fireEvent.click(valorantCheckbox);

      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          expect.stringContaining('/api/v1/me/onboarding'),
          expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('"interestedGames":["Valorant"]'),
          }),
        );
      });
    });
  });
});
