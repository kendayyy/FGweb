import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { GameDTO, MessageDTO, ALLOWED_GAMES } from '@fg/contracts';
import { MessageCircle, Users, Bell, House, Gamepad2, ChevronDown } from 'lucide-react';
import { fetchGames } from './api.js';
import { useLobbyChat } from './useLobbyChat.js';
import { useAuth } from '../auth/index.js';
import { AppShell } from '../../layouts/AppShell.js';
import { RichComposer } from '../chat/RichComposer.js';
import { RichMessage } from '../chat/RichMessage.js';
import './lobby.css';
import './responsive.css';
const abbreviations = ['LM', 'V', 'TFT', 'D2', 'R', 'LQ', 'FF'];
export function LobbyPage() {
    const auth = useAuth();
    const games = useQuery({ queryKey: ['games'], queryFn: ({ signal }) => fetchGames(signal), retry: false });
    const [selected, setSelected] = useState<string | null>(null), [tab, setTab] = useState<'chat' | 'teams'>('chat');
    const game = games.data?.find(item => item.id === selected) ?? games.data?.find(item => item.title === ALLOWED_GAMES[0]) ?? games.data?.[0];
    useEffect(() => {
        if (game)
            document.title = `Lobby · ${game.title} — FG`;
    }, [game]);
    if (games.isPending)
        return <div className="fg-lobby-state" role="status">Đang tải các game…</div>;
    if (games.isError)
        return <div className="fg-lobby-state" role="alert">Không tải được danh sách game. <button className="fg-btn fg-btn-secondary" onClick={() => void games.refetch()}>Thử lại</button></div>;
    if (!game)
        return <div className="fg-lobby-state" role="status">Chưa có Lobby khả dụng.</div>;
    const choose = (id: string) => { setSelected(id); setTab('chat'); };
    return <AppShell showTeams={tab === 'teams'} navigation={<><p className="fg-sidebar-label">GAME CỦA BẠN</p><nav className="fg-game-list">{games.data!.map(item => <button key={item.id} className={item.id === game.id ? 'is-active' : ''} onClick={() => choose(item.id)} aria-current={item.id === game.id ? 'page' : undefined} title={item.title}><span className="fg-game-icon" aria-hidden="true">{abbreviations[ALLOWED_GAMES.indexOf(item.title)] ?? <Gamepad2 size={18}/>}</span><span className="fg-game-name">{item.title}</span></button>)}</nav><nav className="fg-sidebar-footer"><Link to="/protected"><House size={18}/><span>Phòng của tôi</span></Link><Link to={auth.user ? `/users/${encodeURIComponent(auth.user.id)}/profile` : '/login'}><Users size={18}/><span>Hồ sơ của tôi</span></Link></nav></>} header={<header className="fg-game-header"><div className="fg-header-game-icon" aria-hidden="true"><Gamepad2 size={30}/></div><div className="fg-game-heading"><h1>Lobby · {game.title} — FG</h1><p>Trò chuyện · Tìm bạn chơi</p></div><label className="fg-game-select"><span className="fg-sr-only">Chọn game</span><select aria-label="Chọn game" value={game.id} onChange={event => choose(event.target.value)}>{games.data!.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select><ChevronDown size={16} aria-hidden="true"/></label></header>} mobileTabs={<div className="fg-lobby-tabs" role="tablist" aria-label="Nội dung Lobby"><button role="tab" aria-selected={tab === 'chat'} onClick={() => setTab('chat')}><MessageCircle size={18}/>Chat</button><button role="tab" aria-selected={tab === 'teams'} onClick={() => setTab('teams')}><Users size={18}/>Tìm đội</button></div>} chat={<ChatPane key={`${game.id}:${auth.user?.id ?? 'guest'}:${auth.isSigningOut}`} game={game}/>} panel={<><h2>Tìm đội</h2><div className="fg-team-intro"><Users size={28} aria-hidden="true"/><h3>Gặp bạn cùng game</h3><p>Thẻ tuyển đội sẽ xuất hiện ở đây để bạn tìm những người chơi phù hợp.</p></div><div className="fg-online-intro"><h2>Cộng đồng</h2><p>Cùng trò chuyện trong Lobby để tìm bạn chơi.</p></div></>} bottomNavigation={<nav className="fg-lobby-bottom" aria-label="Điều hướng điện thoại"><button aria-current="page" onClick={() => setTab('chat')}><House size={20}/><span>Lobby</span></button><button disabled><Users size={20}/><span>Bạn bè</span></button><button disabled><Bell size={20}/><span>Thông báo</span></button></nav>}/>;
}
function ChatPane({ game }: {
    game: GameDTO;
}) {
    const auth = useAuth(), actorKey = `${auth.user?.id ?? 'guest'}:${auth.isSigningOut}`;
    const chat = useLobbyChat(game, actorKey);
    const [reply, setReply] = useState<MessageDTO | null>(null), [unread, setUnread] = useState(0);
    const candidates = Array.from(new Map(chat.messages.flatMap(message => [message.sender, ...message.mentions]).map(person => [person.id, person])).values());
    const viewport = useRef<HTMLDivElement>(null), nearBottom = useRef(true), lastCount = useRef(0), loadingAnchor = useRef<{
        id: string;
        offset: number;
    } | null>(null);
    const canSend = Boolean(chat.conversationResolved && auth.user && !auth.isLoading && !auth.isError && !auth.isSigningOut && auth.user.onboardingComplete === true && auth.user.interestedGames?.length);
    useLayoutEffect(() => {
        const element = viewport.current;
        if (!element)
            return;
        if (loadingAnchor.current) {
            const anchor = Array.from(element.querySelectorAll<HTMLElement>('[data-message-id]')).find(item => item.dataset.messageId === loadingAnchor.current!.id);
            if (anchor)
                element.scrollTop += anchor.getBoundingClientRect().top - loadingAnchor.current.offset;
            if (!chat.loadingOlder)
                loadingAnchor.current = null;
        }
        else if (nearBottom.current) {
            element.scrollTop = element.scrollHeight;
        }
        else if (chat.messages.length > lastCount.current) {
            const added = chat.messages.length - lastCount.current;
            setUnread(value => value + added);
        }
        lastCount.current = chat.messages.length;
    }, [chat.messages, chat.loadingOlder]);
    return <><div className="fg-chat-status" aria-live="polite"><span>{chat.connection === 'connected' ? 'Đã kết nối' : chat.connection === 'offline' ? 'Mất kết nối · đang kết nối lại…' : 'Đang kết nối…'}</span>{chat.syncError && <button onClick={() => void chat.retry()}>Tải lại tin</button>}</div><div className="fg-message-list" ref={viewport} onScroll={() => {
            const element = viewport.current;
            if (element) {
                nearBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
                if (nearBottom.current)
                    setUnread(0);
            }
        }}>
 {chat.hasOlder && <button className="fg-load-older" disabled={chat.loadingOlder} onClick={() => {
                const element = viewport.current;
                if (element) {
                    const anchor = Array.from(element.querySelectorAll<HTMLElement>('[data-message-id]')).find(item => item.getBoundingClientRect().bottom > element.getBoundingClientRect().top);
                    if (anchor)
                        loadingAnchor.current = { id: anchor.dataset.messageId!, offset: anchor.getBoundingClientRect().top };
                }
                void chat.loadOlder();
            }}>{chat.loadingOlder ? 'Đang tải…' : 'Xem tin trước'}</button>}
 {chat.isLoading && <p className="fg-chat-empty" role="status">Đang tải lịch sử Lobby…</p>}{chat.isError && <div className="fg-chat-empty" role="alert">Không tải được lịch sử Lobby. <button onClick={() => void chat.retry()}>Thử lại</button></div>}{!chat.isLoading && !chat.isError && chat.messages.length === 0 && <div className="fg-chat-empty"><MessageCircle size={32}/><h2>Chào mừng đến Lobby</h2><p>Hãy bắt đầu cuộc trò chuyện và tìm bạn cùng chơi.</p></div>}
 {chat.messages.map(message => <article className="fg-chat-message" key={message.id} data-message-id={message.id}><Link className="fg-chat-avatar" to={`/users/${encodeURIComponent(message.senderId)}/profile`} aria-label={`Hồ sơ ${message.sender.displayName}`}>{message.sender.avatarUrl ? <img src={message.sender.avatarUrl} alt=""/> : message.sender.displayName.slice(0, 1).toUpperCase()}</Link><div className="fg-message-body"><div className="fg-message-meta"><span>{message.sender.displayName}</span><time dateTime={message.createdAt}>{new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' }).format(new Date(message.createdAt))}</time></div><RichMessage message={message} onReply={canSend ? setReply : undefined}/></div></article>)}
 </div>{unread > 0 && <button className="fg-new-messages" onClick={() => {
                nearBottom.current = true;
                setUnread(0);
                if (viewport.current)
                    viewport.current.scrollTop = viewport.current.scrollHeight;
            }}>{unread} tin mới ↓</button>}
 <div className="fg-composer-wrap">{!canSend && <p className="fg-guest-note">{auth.isLoading ? 'Đang kiểm tra tài khoản…' : auth.isError ? 'Không xác minh được tài khoản.' : auth.user && !chat.conversationResolved ? 'Đang kết nối với Lobby…' : <>Bạn đang xem Lobby. <Link to="/login">Đăng nhập Discord</Link> để trò chuyện.</>}</p>}<RichComposer conversationId={chat.conversationId} disabled={!canSend} candidates={candidates} reply={reply} onCancelReply={() => setReply(null)} onSend={request => chat.send(request.content, request.clientMessageId, request)}/></div></>;
}
