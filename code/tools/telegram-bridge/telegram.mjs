export const GREETING = 'Xin chào Ken, tôi là FG Bot, xin báo cáo';
const greet = (text) => `${GREETING}\n\n${String(text).replace(new RegExp(`^${GREETING}\\s*`), '')}`;
export class Telegram {
  constructor(token, fetcher = fetch) { this.token = token; this.fetcher = fetcher; }
  async call(method, body = {}) {
    if (!['getMe', 'getWebhookInfo', 'getUpdates', 'sendMessage', 'setMyCommands', 'sendPhoto'].includes(method)) throw new Error('API method not allowed');
    let result;
    try {
      const response = await this.fetcher(`https://api.telegram.org/bot${this.token}/${method}`, {
        method: 'POST', ...(body instanceof FormData ? { body }
          : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(method === 'getUpdates' ? 30000 : 15000)
      });
      result = await response.json();
    } catch { throw new Error('Telegram connection failed'); }
    if (!result.ok) {
      const error = new Error(`Telegram rejected request (${Number(result.error_code) || 'unknown'})`);
      error.retryAfter = Math.min(300, Math.max(1, Number(result.parameters?.retry_after) || 5));
      throw error;
    }
    return result.result;
  }
  async send(chatId, text) {
    const chars = Array.from(String(text).replace(new RegExp(`^${GREETING}\\s*`), ''));
    let receipt;
    for (let index = 0; index < chars.length; index += 3700) {
      receipt = await this.call('sendMessage', { chat_id: chatId,
        text: greet(chars.slice(index, index + 3700).join('')), link_preview_options: { is_disabled: true } });
    }
    return receipt;
  }
  photo(chatId, bytes, caption, type = 'image/png') {
    const form = new FormData();
    form.set('chat_id', String(chatId)); form.set('caption', Array.from(greet(caption)).slice(0, 950).join(''));
    form.set('photo', new Blob([bytes], { type }), type === 'image/png' ? 'demo.png' : 'demo.jpg');
    return this.call('sendPhoto', form);
  }
}
