import React, { useEffect, useRef, useState } from 'react';
export function AppShell({ navigation, header, chat, panel, mobileTabs, bottomNavigation, showTeams }: {
    navigation: React.ReactNode;
    header: React.ReactNode;
    chat: React.ReactNode;
    panel: React.ReactNode;
    mobileTabs: React.ReactNode;
    bottomNavigation: React.ReactNode;
    showTeams: boolean;
}) {
    const [open, setOpen] = useState(false), toggle = useRef<HTMLButtonElement>(null), drawer = useRef<HTMLDivElement>(null);
    const wasOpen = useRef(false);
    const close = () => { setOpen(false); };
    useEffect(() => {
        if (open)
            drawer.current?.querySelector<HTMLButtonElement>('button')?.focus();
        else if (wasOpen.current)
            toggle.current?.focus();
        wasOpen.current = open;
    }, [open]);
    return <><div className={`fg-lobby-shell ${showTeams ? 'fg-lobby-teams-active' : ''}`} inert={open}><aside className="fg-game-sidebar" aria-label="Game và điều hướng">{navigation}</aside><section className="fg-lobby-main"><div className="fg-mobile-menu"><button ref={toggle} aria-label="Mở điều hướng game" aria-expanded={open} onClick={() => setOpen(true)}>☰<span>Game và phòng</span></button></div>{header}{mobileTabs}<div className="fg-lobby-columns"><section className="fg-chat-column" aria-label="Chat Lobby">{chat}</section><aside className="fg-recruitment-panel" aria-label="Tìm đội">{panel}</aside></div>{bottomNavigation}</section></div>{open && <div className="fg-drawer-backdrop" onClick={event => {
                if (event.target === event.currentTarget)
                    close();
            }}><div className="fg-mobile-drawer" ref={drawer} role="dialog" aria-modal="true" aria-label="Điều hướng game" onKeyDown={event => {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    close();
                }
                if (event.key === 'Tab') {
                    const controls = Array.from(drawer.current?.querySelectorAll<HTMLElement>('button,a') ?? []), first = controls[0], last = controls.at(-1);
                    if (event.shiftKey && document.activeElement === first) {
                        event.preventDefault();
                        last?.focus();
                    }
                    else if (!event.shiftKey && document.activeElement === last) {
                        event.preventDefault();
                        first?.focus();
                    }
                }
            }}><button className="fg-drawer-close" onClick={close}>Đóng điều hướng</button><div onClick={event => {
                if ((event.target as HTMLElement).closest('a,button'))
                    close();
            }}>{navigation}</div></div></div>}</>;
}
