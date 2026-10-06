import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CreateMessageRequestSchema, CreateMessageRequest, MessageDTO, UserSummary, AttachmentDTO } from '@fg/contracts';
import { ImagePlus, Smile, Send, X } from 'lucide-react';
import { uploadImage } from './api.js';
import { registerAuthCleanup } from '../auth/lifecycle.js';
import './rich-chat.css';
export type RichComposerProps = {
    conversationId: string;
    disabled?: boolean;
    candidates: UserSummary[];
    reply?: MessageDTO | null;
    onCancelReply: () => void;
    onSend: (request: CreateMessageRequest) => Promise<unknown>;
    label?: string;
    placeholder?: string;
};
type DraftImage = {
    key: string;
    file: File;
    attachment?: AttachmentDTO;
    progress: number | null;
    error?: string;
    controller?: AbortController;
};
export function RichComposer({ conversationId, disabled, candidates, reply, onCancelReply, onSend, label = 'Tin nhắn Lobby', placeholder = 'Nhắn vào Lobby…' }: RichComposerProps) {
    const [text, setText] = useState(''), [images, setImages] = useState<DraftImage[]>([]), [mentions, setMentions] = useState<UserSummary[]>([]), [error, setError] = useState(''), [sending, setSending] = useState(false), [emoji, setEmoji] = useState(false), [caret, setCaret] = useState(0);
    const textarea = useRef<HTMLTextAreaElement>(null), fileInput = useRef<HTMLInputElement>(null), selection = useRef({ start: 0, end: 0 }), restore = useRef<number | null>(null), active = useRef(true), pending = useRef(false), controllers = useRef(new Set<AbortController>()), retry = useRef<{
        fingerprint: string;
        id: string;
    } | null>(null);
    useEffect(() => { active.current = true; const dispose = () => { active.current = false; for (const controller of controllers.current)
        controller.abort(); controllers.current.clear(); }; const unregister = registerAuthCleanup(dispose); return () => { unregister(); dispose(); }; }, [conversationId]);
    useLayoutEffect(() => { if (restore.current !== null && textarea.current) {
        textarea.current.focus();
        textarea.current.setSelectionRange(restore.current, restore.current);
        restore.current = null;
    } }, [text, emoji]);
    const track = () => { if (textarea.current) {
        selection.current = { start: textarea.current.selectionStart, end: textarea.current.selectionEnd };
        setCaret(selection.current.start);
    } };
    const insert = (value: string, start = selection.current.start, end = selection.current.end) => { const result = text.slice(0, start) + value + text.slice(end); if (result.length > 2000)
        return; restore.current = start + value.length; setCaret(restore.current); setText(result); setEmoji(false); };
    const token = text.slice(0, caret).match(/(?:^|\s)@([^@\s]*)$/), options = token ? candidates.filter(person => person.displayName.toLocaleLowerCase().includes(token[1].toLocaleLowerCase())).slice(0, 8) : [];
    const upload = async (image: DraftImage) => { const controller = new AbortController(); controllers.current.add(controller); setImages(list => list.map(item => item.key === image.key ? { ...item, error: undefined, controller, progress: null } : item)); try {
        const attachment = await uploadImage(conversationId, image.file, progress => { if (active.current)
            setImages(list => list.map(item => item.key === image.key ? { ...item, progress } : item)); }, controller.signal);
        if (active.current && !controller.signal.aborted)
            setImages(list => list.map(item => item.key === image.key ? { ...item, attachment, controller: undefined, progress: 100 } : item));
    }
    catch (problem) {
        if (active.current && !controller.signal.aborted)
            setImages(list => list.map(item => item.key === image.key ? { ...item, error: problem instanceof Error ? problem.message : 'Không tải được ảnh.', controller: undefined } : item));
    }
    finally {
        controllers.current.delete(controller);
    } };
    const submit = async (event: React.FormEvent | React.KeyboardEvent) => { event.preventDefault(); if (disabled || pending.current || !active.current || images.some(image => !image.attachment) || (!text.trim() && !images.length))
        return; const visibleMentions = mentions.filter(person => text.includes(`@${person.displayName}`)); const content = { content: text.trim(), attachmentIds: images.map(image => image.attachment!.id), mentionedUserIds: visibleMentions.map(person => person.id), ...(reply ? { replyToId: reply.id } : {}) }; const fingerprint = JSON.stringify(content); if (retry.current?.fingerprint !== fingerprint)
        retry.current = { fingerprint, id: crypto.randomUUID() }; pending.current = true; setSending(true); setError(''); try {
        await onSend(CreateMessageRequestSchema.parse({ ...content, clientMessageId: retry.current.id }));
        if (active.current) {
            setText('');
            setImages([]);
            setMentions([]);
            retry.current = null;
            onCancelReply();
        }
    }
    catch {
        if (active.current)
            setError('Không gửi được tin. Nội dung và ảnh đã được giữ lại để bạn thử lại.');
    }
    finally {
        pending.current = false;
        if (active.current)
            setSending(false);
    } };
    const busy = disabled || sending;
    return <div className="fg-rich-composer" onKeyDown={event=>{if(event.key==='Escape'){setEmoji(false);setCaret(-1);textarea.current?.focus();}}}>{reply && <div className="fg-reply-preview"><span>Trả lời {reply.sender.displayName}<small>{reply.content || 'Ảnh'}</small></span><button type="button" aria-label="Hủy trả lời" onClick={onCancelReply} disabled={sending}><X size={18}/></button></div>}{images.length > 0 && <ul className="fg-upload-list">{images.map(image => <li key={image.key}><span>{image.file.name}</span>{!image.attachment && !image.error && <progress aria-label={`Tải ảnh ${image.file.name}`} max={100} value={image.progress ?? undefined}/>}<small>{image.attachment ? 'Đã tải ảnh' : image.error ?? 'Đang tải…'}</small>{image.error && <button type="button" disabled={busy} onClick={() => void upload(image)}>Thử tải lại</button>}<button type="button" aria-label={`Bỏ ảnh ${image.file.name}`} disabled={sending} onClick={() => { image.controller?.abort(); setImages(list => list.filter(item => item.key !== image.key)); }}><X size={18}/></button></li>)}</ul>}{error && <p role="alert">{error}</p>}
 <form className="fg-chat-composer fg-rich-form" onSubmit={event => void submit(event)}><textarea ref={textarea} aria-label={label} placeholder={placeholder} maxLength={2000} rows={1} disabled={busy} value={text} onChange={event => { setText(event.target.value); selection.current = { start: event.target.selectionStart, end: event.target.selectionEnd }; setCaret(event.target.selectionStart); }} onSelect={track} onKeyDown={event => { if (event.key === 'Escape') {
        setEmoji(false);
        setCaret(-1);
    } if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing)
        void submit(event); }}/><div className="fg-rich-actions"><button type="button" aria-label="Thêm ảnh" disabled={busy} onClick={() => fileInput.current?.click()}><ImagePlus size={20}/></button><button type="button" aria-label="Chọn emoji" disabled={busy} aria-expanded={emoji} onClick={() => { track(); setEmoji(value => !value); }}><Smile size={20}/></button><button type="submit" aria-label="Gửi tin nhắn" disabled={busy || images.some(image => !image.attachment) || (!text.trim() && !images.length)}><Send size={20}/></button></div></form>
 <input className="fg-sr-only" type="file" ref={fileInput} aria-label="Chọn tệp ảnh" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) {
        const image: DraftImage = { key: crypto.randomUUID(), file, progress: null };
        setImages(list => [...list, image]);
        void upload(image);
    } }}/>
 {emoji && <div className="fg-emoji-picker" role="group" aria-label="Emoji">{['🎮', '😊', '👍', '🔥', '😂', '❤️', '👋', '🎉'].map(value => <button type="button" key={value} aria-label={`Chèn ${value}`} onClick={() => insert(value)}>{value}</button>)}</div>}
 {options.length > 0 && <div className="fg-mention-picker" role="listbox" aria-label="Nhắc người trong cuộc trò chuyện">{options.map(person => <button type="button" role="option" aria-selected={false} key={person.id} onClick={() => { const start = caret - token![1].length - 1; insert(`@${person.displayName} `, start, caret); setMentions(list => list.some(item => item.id === person.id) ? list : [...list, person]); }}>{person.displayName}</button>)}</div>}
 </div>;
}
