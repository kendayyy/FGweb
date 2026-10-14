import {InitialLoading} from '../../components/ui/InitialLoading.js';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { GameDTO, MessageDTO, ALLOWED_GAMES, UserSummary, ProfileDTO, IdSchema } from '@fg/contracts';
import { MessageCircle, Users, House, ChevronDown, X } from 'lucide-react';
import { fetchGames } from './api.js';
import { useLobbyChat } from './useLobbyChat.js';
import { useAuth } from '../auth/index.js';
import { AppShell } from '../../layouts/AppShell.js';
import { RichComposer } from '../chat/RichComposer.tsx';
import { RichMessage } from '../chat/RichMessage.tsx';
import { OnlineUsers } from './OnlineUsers.tsx';
import { fetchBlocks, FriendsModal, PeerSocialControls } from '../friends/index.ts';
import { DirectMessagesPanel, useDirectMessages } from '../direct-messages/index.ts';
import { RecruitmentPanel } from '../recruitments/index.js';
import {GameLogo, GameNavButton} from '../../components/ui/GameLogo.js';
import {FGLogo} from '../../components/ui/FGLogo.js';
import {NotificationBell} from '../notifications/index.js';
import './lobby.css';
import './responsive.css';



export function LobbyPage() {
    const auth = useAuth();
    const [notificationParams,setNotificationParams]=useSearchParams();
    const dm = useDirectMessages();
    const games = useQuery({ queryKey: ['games'], queryFn: ({ signal }) => fetchGames(signal), retry: false });
    const [selected, setSelected] = useState<string | null>(null), [tab, setTab] = useState<'chat' | 'teams'>('chat');
    const [isFriendsOpen, setIsFriendsOpen] = useState(false);
    const [isDMOpen, setIsDMOpen] = useState(false);
    const [dmConvId, setDmConvId] = useState<string | null>(null);
    const [selectedPeer, setSelectedPeer] = useState<UserSummary | ProfileDTO | null>(null);

    useEffect(()=>{
        const next=new URLSearchParams(notificationParams);let changed=false;const requestedGame=notificationParams.get('game');
        if(requestedGame&&games.data){if(games.data.some(item=>item.id===requestedGame))setSelected(requestedGame);next.delete('game');changed=true;}
        if(auth.user&&!auth.isError&&!auth.isSigningOut){const conversation=notificationParams.get('dm');if(conversation){if(IdSchema.safeParse(conversation).success&&conversation!=='.'&&conversation!=='..'&&conversation.length<=512&&!/[\u0000-\u001f\u007f]/.test(conversation)){setDmConvId(conversation);setIsDMOpen(true);}next.delete('dm');changed=true;}if(notificationParams.get('friends')==='1'){setIsFriendsOpen(true);next.delete('friends');changed=true;}}
        if(changed)setNotificationParams(next,{replace:true});
    },[notificationParams,setNotificationParams,auth.user,auth.isError,auth.isSigningOut,games.data]);
    const game = games.data?.find(item => item.id === selected) ?? games.data?.find(item => item.title === ALLOWED_GAMES[0]) ?? games.data?.[0];
    useEffect(() => {
        if (game)
            document.title = `Lobby · ${game.title} — FG`;
    }, [game]);
    if (games.isPending && !games.data)
        return <InitialLoading pending layout="lobby" label="Đang tải các game"/>;
    if (games.isError)
        return <div className="fg-lobby-state" role="alert">Không tải được danh sách game. <button className="fg-btn fg-btn-secondary" onClick={() => void games.refetch()}>Thử lại</button></div>;
    if (!game)
        return <div className="fg-lobby-state" role="status">Chưa có Lobby khả dụng.</div>;
    const choose = (id: string) => { setSelected(id); setTab('chat'); };

    const handleOpenDM = (convId: string) => {
        setDmConvId(convId);
        setIsDMOpen(true);
        setSelectedPeer(null);
    };

    return <>
        <AppShell showTeams={tab === 'teams'} navigation={<><Link to="/" className="fg-brand-link" aria-label="FG"><FGLogo size={40} decorative/></Link><nav className="fg-game-list" aria-label="Chọn game Lobby">{games.data!.map(item => <GameNavButton key={item.id} game={item.title} active={item.id===game.id} onClick={()=>choose(item.id)}/>)}</nav><nav className="fg-sidebar-footer"><Link to="/protected" aria-label="Phòng của tôi" title="Phòng của tôi"><House size={18}/><span>Phòng của tôi</span></Link><Link aria-label="Hồ sơ của tôi" title="Hồ sơ của tôi" to={auth.user ? `/users/${encodeURIComponent(auth.user.id)}/profile` : '/login'}><Users size={18}/><span>Hồ sơ của tôi</span></Link>{auth.user && <button type="button" className="fg-sidebar-friends-btn" aria-label="Bạn bè & Lời mời" title="Bạn bè & Lời mời" onClick={() => setIsFriendsOpen(true)} style={{ background: 'none', border: 'none', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '6px 0', fontSize: '14px', width: '100%' }}><Users size={18}/><span>Bạn bè & Lời mời</span></button>}</nav></>} header={<header className="fg-game-header"><div className="fg-header-game-icon" aria-hidden="true"><GameLogo game={game.title} decorative/></div><div className="fg-game-heading"><h1>Lobby · {game.title} — FG</h1><p>Trò chuyện · Tìm bạn chơi</p></div><label className="fg-game-select"><span className="fg-sr-only">Chọn game</span><select aria-label="Chọn game" value={game.id} onChange={event => choose(event.target.value)}>{games.data!.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select><ChevronDown size={16} aria-hidden="true"/></label>{auth.user && <div className="fg-header-actions" style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}><button type="button" className="fg-btn fg-btn-secondary" onClick={() => setIsDMOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: '6px 12px' }}><MessageCircle size={16}/><span>Tin nhắn</span>{dm.totalUnread > 0 && <span data-testid="dm-unread-badge" style={{ backgroundColor: 'var(--color-action)', color: 'var(--btn-primary-text)', fontSize: '11px', fontWeight: 700, padding: '2px 6px', borderRadius: '10px' }}>{dm.totalUnread}</span>}</button><button type="button" className="fg-btn fg-btn-secondary" onClick={() => setIsFriendsOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: '6px 12px' }}><Users size={16} aria-hidden="true"/><span>Bạn bè</span></button></div>}</header>} mobileTabs={<div className="fg-lobby-tabs" role="tablist" aria-label="Nội dung Lobby"><button role="tab" aria-selected={tab === 'chat'} onClick={() => setTab('chat')}><MessageCircle size={18}/>Chat</button><button role="tab" aria-selected={tab === 'teams'} onClick={() => setTab('teams')}><Users size={18}/>Tìm đội</button></div>} chat={<ChatPane key={`${game.id}:${auth.user?.id ?? 'guest'}:${auth.isSigningOut}`} game={game} onSelectPeer={setSelectedPeer}/>} panel={<><RecruitmentPanel key={`recruitment:${game.id}:${auth.user?.id ?? 'guest'}:${auth.isSigningOut}`} game={game}/><OnlineUsers key={`${game.id}:${auth.user?.id ?? 'guest'}:${auth.isSigningOut}`} game={game}/></>} bottomNavigation={<nav className="fg-lobby-bottom" aria-label="Điều hướng điện thoại"><button aria-current="page" onClick={() => setTab('chat')}><House size={20}/><span>Lobby</span></button><button aria-label="Bạn bè mobile" onClick={() => { if (auth.user) setIsFriendsOpen(true); }} disabled={!auth.user}><Users size={20}/><span aria-hidden="true">Bạn bè</span></button><NotificationBell mobile/></nav>}/>
        {isFriendsOpen && <FriendsModal isOpen={isFriendsOpen} onClose={() => setIsFriendsOpen(false)} onOpenDM={handleOpenDM} />}
        <DirectMessagesPanel isOpen={isDMOpen} onClose={() => { setIsDMOpen(false); setDmConvId(null); }} initialConversationId={dmConvId} dm={dm} />
        {selectedPeer && <PeerModal peer={selectedPeer} onClose={() => setSelectedPeer(null)} onOpenDM={handleOpenDM} />}
    </>;
}

function ChatPane({ game, onSelectPeer }: {
    game: GameDTO;
    onSelectPeer?: (peer: UserSummary) => void;
}) {
    const auth = useAuth(), actorKey = `${auth.user?.id ?? 'guest'}:${auth.isSigningOut}`;
    const chat = useLobbyChat(game, actorKey);

    // Fetch user block list when logged in
    const blocksQuery = useQuery({
        queryKey: ['blocks', auth.user?.id],
        queryFn: ({ signal }) => fetchBlocks(signal),
        enabled: Boolean(auth.user && !auth.isLoading && !auth.isSigningOut),
    });
    const blockedIds = new Set((blocksQuery.data || []).map(b => b.blockedId));
    const visibleMessages = chat.messages.filter(msg => !blockedIds.has(msg.senderId));

    const [reply, setReply] = useState<MessageDTO | null>(null), [unread, setUnread] = useState(0);
    const candidates = Array.from(new Map(visibleMessages.flatMap(message => [message.sender, ...message.mentions]).map(person => [person.id, person])).values());
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
        else if (visibleMessages.length > lastCount.current) {
            const added = visibleMessages.length - lastCount.current;
            setUnread(value => value + added);
        }
        lastCount.current = visibleMessages.length;
    }, [visibleMessages, chat.loadingOlder]);
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
 {chat.isLoading && visibleMessages.length === 0 && <InitialLoading pending layout="chat" label="Đang tải lịch sử Lobby"/>}{chat.isError && <div className="fg-chat-empty" role="alert">Không tải được lịch sử Lobby. <button onClick={() => void chat.retry()}>Thử lại</button></div>}{!chat.isLoading && !chat.isError && visibleMessages.length === 0 && <div className="fg-chat-empty"><MessageCircle size={32}/><h2>Chào mừng đến Lobby</h2><p>Hãy bắt đầu cuộc trò chuyện và tìm bạn cùng chơi.</p></div>}
 {visibleMessages.map(message => <article className="fg-chat-message" key={message.id} data-message-id={message.id}><Link className="fg-chat-avatar" to={`/users/${encodeURIComponent(message.senderId)}/profile`} aria-label={`Hồ sơ ${message.sender.displayName}`}>{message.sender.avatarUrl ? <img src={message.sender.avatarUrl} alt=""/> : message.sender.displayName.slice(0, 1).toUpperCase()}</Link><div className="fg-message-body"><div className="fg-message-meta"><button type="button" onClick={() => onSelectPeer?.(message.sender)} style={{ background: 'none', border: 'none', color: 'inherit', font: 'inherit', cursor: 'pointer', padding: 0 }}><span>{message.sender.displayName}</span></button><time dateTime={message.createdAt}>{new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' }).format(new Date(message.createdAt))}</time></div><RichMessage message={message} onReply={canSend ? setReply : undefined}/></div></article>)}
 </div>{unread > 0 && <button className="fg-new-messages" onClick={() => {
                nearBottom.current = true;
                setUnread(0);
                if (viewport.current)
                    viewport.current.scrollTop = viewport.current.scrollHeight;
            }}>{unread} tin mới ↓</button>}
 <div className="fg-composer-wrap">{!canSend && <p className="fg-guest-note">{auth.isLoading ? 'Đang kiểm tra tài khoản…' : auth.isError ? 'Không xác minh được tài khoản.' : auth.user && !chat.conversationResolved ? 'Đang kết nối với Lobby…' : <>Bạn đang xem Lobby. <Link to="/login">Đăng nhập</Link> để trò chuyện.</>}</p>}<RichComposer conversationId={chat.conversationId} disabled={!canSend} candidates={candidates} reply={reply} onCancelReply={() => setReply(null)} onSend={request => chat.send(request.content, request.clientMessageId, request)}/></div></>;
}

function PeerModal({ peer, onClose, onOpenDM }: { peer: UserSummary | ProfileDTO; onClose: () => void; onOpenDM: (convId: string) => void }) {
    return (
        <div className="fg-modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'var(--bg-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }} role="dialog" aria-modal="true" aria-label={`Hồ sơ ${peer.displayName}`}>
            <div style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px', maxWidth: '400px', width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>{peer.displayName}</h3>
                    <button type="button" onClick={onClose} aria-label="Đóng" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={18}/></button>
                </div>
                <PeerSocialControls targetUser={peer} onDMOpen={(convId) => { onClose(); onOpenDM(convId); }} />
            </div>
        </div>
    );
}
