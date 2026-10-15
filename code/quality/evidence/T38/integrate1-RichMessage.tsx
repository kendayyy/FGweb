import React, { useEffect, useRef, useState } from 'react';
import type { MessageDTO, AttachmentDTO } from '@fg/contracts';
import { Reply, X, Image } from 'lucide-react';
import { downloadImage } from './api.js';
import './rich-chat.css';
export function RichMessage({ message, onReply, actions }: {
    message: MessageDTO;
    actions?: React.ReactNode;
    onReply?: (message: MessageDTO) => void;
}) {
    const [image, setImage] = useState<AttachmentDTO | null>(null);
    return <><div className="fg-rich-message">{message.replyToMessage && <div className="fg-reply-preview"><span>{message.replyToMessage.sender.displayName}<small>{message.replyToMessage.content || 'Ảnh'}</small></span></div>}{message.content && <p className="fg-message-bubble">{message.content}</p>}{message.mentions.length > 0 && <div className="fg-message-mentions">{message.mentions.map(person => <span key={person.id}>@{person.displayName}</span>)}</div>}{message.attachments.length > 0 && <div className="fg-image-buttons">{message.attachments.map(attachment => <button type="button" key={attachment.id} aria-label={`Xem ảnh ${attachment.fileName}`} onClick={() => setImage(attachment)}><Image size={20}/><span>{attachment.fileName}</span></button>)}</div>}{onReply && <button type="button" className="fg-reply-action" aria-label={`Trả lời tin nhắn của ${message.sender.displayName}`} onClick={() => onReply(message)}><Reply size={16}/><span>Trả lời</span></button>}{actions}</div>{image && <ImageModal key={image.id} image={image} onClose={() => setImage(null)}/>}</>;
}
function ImageModal({ image, onClose }: {
    image: AttachmentDTO;
    onClose: () => void;
}) {
    const [url, setUrl] = useState<string | null>(null), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
    const dialog = useRef<HTMLDivElement>(null), close = useRef<HTMLButtonElement>(null);
    useEffect(() => { const previous = document.activeElement as HTMLElement | null; close.current?.focus(); return () => previous?.focus(); }, []);
    useEffect(() => { const controller = new AbortController(); let owned: string | undefined; setError(''); setUrl(null); void downloadImage(image.id, controller.signal).then(blob => { if (controller.signal.aborted)
        return; owned = URL.createObjectURL(blob); setUrl(owned); }).catch(problem => { if (!controller.signal.aborted)
        setError(problem instanceof Error ? problem.message : 'Không xem được ảnh.'); }); return () => { controller.abort(); if (owned)
        URL.revokeObjectURL(owned); }; }, [image.id, attempt]);
    return <div className="fg-image-overlay" onClick={event => { if (event.target === event.currentTarget)
        onClose(); }}><div ref={dialog} className="fg-image-modal" role="dialog" aria-modal="true" aria-label={`Ảnh ${image.fileName}`} onKeyDown={event => { if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
    } if (event.key === 'Tab') {
        const buttons = Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
        const first = buttons[0], last = buttons.at(-1);
        if ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
            event.preventDefault();
            (event.shiftKey ? last : first)?.focus();
        }
    } }}><header><span>{image.fileName}</span><button type="button" ref={close} aria-label="Đóng ảnh" onClick={onClose}><X size={20}/></button></header>{error ? <div role="alert">{error}<button type="button" onClick={() => setAttempt(value => value + 1)}>Thử lại</button></div> : url ? <img src={url} alt={image.fileName}/> : <p role="status">Đang tải ảnh…</p>}</div></div>;
}
