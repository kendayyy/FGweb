import { makeSignature } from 'better-auth/crypto';

export async function createSignedSessionCookie(secret: string, token: string): Promise<string> {
  const signature = await makeSignature(token, secret);
  return `better-auth.session_token=${token}.${signature}`;
}
