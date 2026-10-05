import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import type { MessageDTO, CreateMessageRequest } from '@fg/contracts';
import { RichComposer } from '../src/features/chat/RichComposer.js';
import { RichMessage } from '../src/features/chat/RichMessage.js';
const person = { id: 'opaque-peer', displayName: 'Bạn chơi', avatarUrl: null, customStatus: 'JUST_CHATTING' as const };
const message: MessageDTO = { id: 'reply-id', conversationId: 'private', senderId: person.id, sender: person, content: 'Tin trước', attachments: [], mentions: [], mentionedUserIds: [], createdAt: '2026-10-05T00:00:00Z' };
const base = { conversationId: 'private', candidates: [person], onCancelReply: vi.fn() };
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('T15 rich chat behavior', () => {
    it('Escape closes a focused emoji menu and restores composer focus', () => {
        render(<RichComposer {...base} onSend={vi.fn()}/>);
        fireEvent.click(screen.getByLabelText('Chọn emoji'));
        const option=screen.getByLabelText('Chèn 🎮'); option.focus();
        fireEvent.keyDown(option,{key:'Escape'});
        expect(screen.queryByRole('group',{name:'Emoji'})).toBeNull();
        expect(screen.getByLabelText('Tin nhắn Lobby')).toHaveFocus();
    });
    it('failed send retains content and retry keeps clientMessageId', async () => {
        const requests: CreateMessageRequest[] = [];
        const send = vi.fn(async (request: CreateMessageRequest) => { requests.push(request); if (requests.length === 1)
            throw new Error('offline'); });
        render(<RichComposer {...base} onSend={send}/>);
        fireEvent.change(screen.getByLabelText('Tin nhắn Lobby'), { target: { value: 'Giữ tin này' } });
        fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));
        await screen.findByRole('alert');
        expect(screen.getByLabelText('Tin nhắn Lobby')).toHaveValue('Giữ tin này');
        fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));
        await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
        expect(requests[1].clientMessageId).toBe(requests[0].clientMessageId);
        await waitFor(() => expect(screen.getByLabelText('Tin nhắn Lobby')).toHaveValue(''));
    });
    it('reply can be canceled without sending or losing text', () => {
        const cancel = vi.fn();
        render(<RichComposer {...base} reply={message} onCancelReply={cancel} onSend={vi.fn()}/>);
        fireEvent.change(screen.getByLabelText('Tin nhắn Lobby'), { target: { value: 'Đang soạn' } });
        fireEvent.click(screen.getByLabelText('Hủy trả lời'));
        expect(cancel).toHaveBeenCalledOnce();
        expect(screen.getByLabelText('Tin nhắn Lobby')).toHaveValue('Đang soạn');
    });
    it('emoji inserts at selected caret and restores caret', async () => {
        render(<RichComposer {...base} onSend={vi.fn()}/>);
        const input = screen.getByLabelText('Tin nhắn Lobby') as HTMLTextAreaElement;
        fireEvent.change(input, { target: { value: 'abc' } });
        input.focus();
        input.setSelectionRange(1, 2);
        fireEvent.select(input);
        fireEvent.click(screen.getByLabelText('Chọn emoji'));
        fireEvent.click(screen.getByLabelText('Chèn 🎮'));
        expect(input.value).toBe('a🎮c');
        await waitFor(() => expect(input.selectionStart).toBe(3));
        expect(input).toHaveFocus();
    });
    it('mention picker uses opaque candidate ID and display name', async () => {
        const send = vi.fn(async (request: CreateMessageRequest) => { void request; });
        render(<RichComposer {...base} onSend={send}/>);
        fireEvent.change(screen.getByLabelText('Tin nhắn Lobby'), { target: { value: '@Bạn' } });
        fireEvent.click(await screen.findByRole('option', { name: 'Bạn chơi' }));
        fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));
        await waitFor(() => expect(send).toHaveBeenCalledOnce());
        expect(send.mock.calls[0][0]).toMatchObject({ content: '@Bạn chơi', mentionedUserIds: ['opaque-peer'] });
    });
    it('script content is rendered literally and reply control exists', () => {
        const reply = vi.fn();
        const text = '<script>window.hacked=true</script>';
        const { container } = render(<RichMessage message={{ ...message, content: text }} onReply={reply}/>);
        expect(screen.getByText(text)).toBeInTheDocument();
        expect(container.querySelector('script')).toBeNull();
        fireEvent.click(screen.getByLabelText('Trả lời tin nhắn của Bạn chơi'));
        expect(reply).toHaveBeenCalledWith(expect.objectContaining({ id: 'reply-id' }));
    });
    it('private image fetches protected endpoints with session and closes on Escape', async () => {
        const fetch = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => { void options; return String(input).endsWith('/content') ? new Response('webp', { headers: { 'Content-Type': 'image/webp' } }) : new Response(JSON.stringify({ url: `${window.location.origin}/api/v1/attachments/image-id/content` }), { headers: { 'Content-Type': 'application/json' } }); });
        vi.stubGlobal('fetch', fetch);
        const revoke = vi.fn();
        vi.stubGlobal('URL', class extends URL {
            static createObjectURL = vi.fn(() => 'blob:test');
            static revokeObjectURL = revoke;
        });
        render(<RichMessage message={{ ...message, attachments: [{ id: 'image-id', url: `${window.location.origin}/api/v1/attachments/image-id/content`, fileName: 'Ảnh.webp', fileSize: 12, mimeType: 'image/webp' }] }}/>);
        fireEvent.click(screen.getByRole('button', { name: 'Xem ảnh Ảnh.webp' }));
        await screen.findByRole('dialog');
        await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
        for (const [, options] of fetch.mock.calls)
            expect(options).toMatchObject({ credentials: 'include' });
        await screen.findByAltText('Ảnh.webp');
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(revoke).toHaveBeenCalledWith('blob:test');
    });
    it('disabled composer cannot send or select uploads', () => {
        render(<RichComposer {...base} disabled onSend={vi.fn()}/>);
        expect(screen.getByLabelText('Tin nhắn Lobby')).toBeDisabled();
        expect(screen.getByLabelText('Thêm ảnh')).toBeDisabled();
        expect(screen.getByLabelText('Gửi tin nhắn')).toBeDisabled();
    });
    it('upload progress and retry are real transport state; failed send retains uploaded image', async () => {
        const calls: FakeXHR[] = [];
        class FakeXHR {
            upload: {
                onprogress?: (event: {
                    lengthComputable: boolean;
                    loaded: number;
                    total: number;
                }) => void;
            } = {};
            status = 0;
            responseText = '';
            withCredentials = false;
            onload?: () => void;
            onerror?: () => void;
            onabort?: () => void;
            data?: FormData;
            open = vi.fn();
            setRequestHeader = vi.fn();
            send(data: FormData) { this.data = data; calls.push(this); }
            abort() { this.onabort?.(); }
        }
        vi.stubGlobal('XMLHttpRequest', FakeXHR);
        const send = vi.fn(async (request: CreateMessageRequest) => { void request; throw new Error('offline'); });
        render(<RichComposer {...base} onSend={send}/>);
        fireEvent.change(screen.getByLabelText('Tin nhắn Lobby'), { target: { value: 'Ảnh cho đội' } });
        fireEvent.change(screen.getByLabelText('Chọn tệp ảnh'), { target: { files: [new File(['png'], 'team.png', { type: 'image/png' })] } });
        await waitFor(() => expect(calls).toHaveLength(1));
        expect(calls[0].withCredentials).toBe(true);
        expect(calls[0].data?.get('conversationId')).toBe('private');
        calls[0].onerror?.();
        await screen.findByRole('button', { name: 'Thử tải lại' });
        expect(screen.getByLabelText('Tin nhắn Lobby')).toHaveValue('Ảnh cho đội');
        fireEvent.click(screen.getByRole('button', { name: 'Thử tải lại' }));
        await waitFor(() => expect(calls).toHaveLength(2));
        calls[1].upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 });
        await waitFor(() => expect(screen.getByRole('progressbar')).toHaveAttribute('value', '50'));
        calls[1].status = 201;
        calls[1].responseText = JSON.stringify({ id: 'draft-id', url: `${window.location.origin}/api/v1/attachments/draft-id/content`, fileName: 'team.webp', fileSize: 100, mimeType: 'image/webp' });
        calls[1].onload?.();
        await screen.findByText('Đã tải ảnh');
        fireEvent.click(screen.getByLabelText('Gửi tin nhắn'));
        await screen.findByRole('alert');
        expect(screen.getByLabelText('Tin nhắn Lobby')).toHaveValue('Ảnh cho đội');
        expect(screen.getByText('Đã tải ảnh')).toBeVisible();
        expect(send.mock.calls[0][0].attachmentIds).toEqual(['draft-id']);
    });
    it('forbidden image shows real error and never displays remote content', async () => {
        const fetch = vi.fn(async (input: RequestInfo | URL) => { void input; return new Response('{}', { status: 403 }); });
        vi.stubGlobal('fetch', fetch);
        render(<RichMessage message={{ ...message, attachments: [{ id: 'private-image', url: 'https://evil.example/image', fileName: 'private.webp', fileSize: 10, mimeType: 'image/webp' }] }}/>);
        fireEvent.click(screen.getByRole('button', { name: 'Xem ảnh private.webp' }));
        await screen.findByRole('alert');
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('img')).toBeNull();
        expect(fetch.mock.calls[0][0]).toBe('/api/v1/attachments/private-image');
    });
});
