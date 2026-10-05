import type { MessageDTO } from '@fg/contracts';
const timestamp = (value: string) => value.replace(/(?:\.(\d+))?Z$/, (_match, fraction: string | undefined) => `.${(fraction ?? '').padEnd(9, '0')}Z`);
export function reconcileMessages(conversationId: string, ...batches: MessageDTO[][]) {
    const messages = new Map<string, MessageDTO>();
    for (const batch of batches)
        for (const message of batch)
            if (message.conversationId === conversationId)
                messages.set(message.id, message);
    return [...messages.values()].sort((a, b) => timestamp(a.createdAt).localeCompare(timestamp(b.createdAt)) || a.id.localeCompare(b.id));
}
