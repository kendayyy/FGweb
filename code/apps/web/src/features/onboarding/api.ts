import { OnboardingRequest, OnboardingRequestSchema, PrivateProfileDTO, PrivateProfileSchema } from '@fg/contracts';

export async function submitOnboarding(data: OnboardingRequest,signal?:AbortSignal): Promise<PrivateProfileDTO> {
  const parsed = OnboardingRequestSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error('Dữ liệu onboarding không hợp lệ');
  }

  const res = await fetch('/api/v1/me/onboarding', {
    signal,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(parsed.data),
  });

  if (!res.ok) {
    let msg = `Cập nhật onboarding thất bại (HTTP ${res.status})`;
    try {
      const errJson = await res.json();
      if (errJson && typeof errJson.message === 'string') {
        msg = errJson.message;
      }
    } catch {
      // fallback message
    }
    throw new Error(msg);
  }

  const resData = await res.json();
  const parsedRes = PrivateProfileSchema.safeParse(resData);
  if (!parsedRes.success) {
    throw new Error('Máy chủ trả về dữ liệu hồ sơ không đúng chuẩn');
  }

  return parsedRes.data;
}
