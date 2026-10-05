import {
  ProfileDTO,
  PublicProfileSchema,
  GameDTO,
  GameSchema,
  UpdateProfileRequest,
  UpdateProfileRequestSchema,
  PrivateProfileDTO,
  PrivateProfileSchema,
  UpdateInterestsRequest,
  UpdateInterestsRequestSchema,
  InterestsResponse,
  InterestsResponseSchema,
  UpdateGameProfileRequest,
  UpdateGameProfileRequestSchema,
  GameProfileDTO,
  GameProfileSchema,
} from '@fg/contracts';

export async function fetchPublicProfile(id: string,signal?:AbortSignal): Promise<ProfileDTO> {
  const res = await fetch(`/api/v1/users/${encodeURIComponent(id)}/profile`, {
    method: 'GET',
    signal,
    headers: {
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Tải hồ sơ người dùng thất bại (HTTP ${res.status})`);
  }

  const data = await res.json();
  const parsed = PublicProfileSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error('Cấu trúc hồ sơ nhận từ máy chủ không đúng chuẩn');
  }

  return parsed.data;
}

export async function fetchGames(signal?:AbortSignal): Promise<GameDTO[]> {
  const res = await fetch('/api/v1/games', {
    signal,
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Tải danh mục game thất bại (HTTP ${res.status})`);
  }

  const data = await res.json();
  if (!Array.isArray(data)) {
    throw new Error('Danh mục game phải là danh sách');
  }

  const parsed = data.map((g) => GameSchema.parse(g));
  return parsed;
}

export async function updateProfile(data: UpdateProfileRequest,signal?:AbortSignal): Promise<PrivateProfileDTO> {
  const parsed = UpdateProfileRequestSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error('Dữ liệu cập nhật hồ sơ không hợp lệ');
  }

  const res = await fetch('/api/v1/me/profile', {
    signal,
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(parsed.data),
  });

  if (!res.ok) {
    let msg = `Cập nhật hồ sơ thất bại (HTTP ${res.status})`;
    try {
      const errJson = await res.json();
      if (errJson && typeof errJson.message === 'string') {
        msg = errJson.message;
      }
    } catch {
      // fallback
    }
    throw new Error(msg);
  }

  const resData = await res.json();
  return PrivateProfileSchema.parse(resData);
}

export async function updateInterests(data: UpdateInterestsRequest,signal?:AbortSignal): Promise<InterestsResponse> {
  const parsed = UpdateInterestsRequestSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error('Danh sách game quan tâm không hợp lệ');
  }

  const res = await fetch('/api/v1/me/interests', {
    signal,
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(parsed.data),
  });

  if (!res.ok) {
    throw new Error(`Cập nhật game quan tâm thất bại (HTTP ${res.status})`);
  }

  const resData = await res.json();
  return InterestsResponseSchema.parse(resData);
}

export async function updateGameProfile(
  gameId: string,
  data: UpdateGameProfileRequest,
  signal?:AbortSignal,
): Promise<GameProfileDTO> {
  const parsed = UpdateGameProfileRequestSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error('Dữ liệu hồ sơ game không hợp lệ');
  }

  const res = await fetch(`/api/v1/me/game-profiles/${encodeURIComponent(gameId)}`, {
    signal,
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(parsed.data),
  });

  if (!res.ok) {
    let msg = `Cập nhật hồ sơ game thất bại (HTTP ${res.status})`;
    try {
      const errJson = await res.json();
      if (errJson && typeof errJson.message === 'string') {
        msg = errJson.message;
      }
    } catch {
      // fallback
    }
    throw new Error(msg);
  }

  const resData = await res.json();
  return GameProfileSchema.parse(resData);
}
