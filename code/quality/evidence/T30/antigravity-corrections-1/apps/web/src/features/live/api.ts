import { CallJoinSchema, CallControlSuccessSchema, type CallJoinDTO, type CallControlSuccess } from '@fg/contracts';
import { CallApiError } from '../calls/api.js';

export async function claimScreenShare(callId: string, signal?: AbortSignal): Promise<CallJoinDTO> {
  const response = await fetch(`/api/v1/calls/${encodeURIComponent(callId)}/screen-share/claim`, {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
    signal,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new CallApiError(response.status, typeof error?.code === 'string' ? error.code : undefined);
  }
  return CallJoinSchema.parse(await response.json());
}

export async function releaseScreenShare(callId: string): Promise<CallControlSuccess> {
  const response = await fetch(`/api/v1/calls/${encodeURIComponent(callId)}/screen-share/release`, {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
    keepalive: true,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new CallApiError(response.status, typeof error?.code === 'string' ? error.code : undefined);
  }
  return CallControlSuccessSchema.parse(await response.json());
}
