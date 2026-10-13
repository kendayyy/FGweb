/** Matrix canonical JSON for public integrity/signature payloads, never a KDF. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isSafeInteger(value)) return JSON.stringify(value);
  if (typeof value === 'string' && Array.from(value).every(character => {
    const point = character.codePointAt(0)!; return point < 0xd800 || point > 0xdfff;
  })) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value !== 'object' || !value || Object.getPrototypeOf(value) !== Object.prototype) throw new Error('INVALID_PUBLIC_JSON');
  const data = value as Record<string, unknown>;
  const keys = Object.keys(data).sort((first, second) => {
    const a = Array.from(first), b = Array.from(second);
    for (let index = 0; index < Math.min(a.length, b.length); index++) {
      const difference = a[index].codePointAt(0)! - b[index].codePointAt(0)!;
      if (difference) return difference;
    }
    return a.length - b.length;
  });
  return `{${keys.map(key => `${canonicalJson(key)}:${canonicalJson(data[key])}`).join(',')}}`;
}

export async function publicSha256(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.slice().buffer));
  return btoa(String.fromCharCode(...digest)).replace(/=+$/, '');
}
