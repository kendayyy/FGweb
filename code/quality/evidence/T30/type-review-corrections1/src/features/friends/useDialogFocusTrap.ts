import { useEffect, useLayoutEffect, useRef } from 'react';

export function useDialogFocusTrap<T extends HTMLElement>(
  isOpen: boolean,
  onClose: () => void
) {
  const containerRef = useRef<T | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const lastActiveOpenerRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const isValidTarget = (el: HTMLElement | null): el is HTMLElement =>
    Boolean(
      el &&
        el.isConnected &&
        el !== document.body &&
        !el.hasAttribute('disabled') &&
        typeof el.focus === 'function'
    );

  // Track user focus and click triggers outside open dialogs
  useEffect(() => {
    const trackFocus = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (target && target.tagName && ['BUTTON', 'A', 'INPUT'].includes(target.tagName)) {
        if (!containerRef.current || !containerRef.current.contains(target)) {
          if (isValidTarget(target)) {
            lastActiveOpenerRef.current = target;
          }
        }
      }
    };
    const trackClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const btn = (target?.closest ? target.closest('button, a') : null) as HTMLElement;
      if (btn && (!containerRef.current || !containerRef.current.contains(btn))) {
        if (isValidTarget(btn)) {
          lastActiveOpenerRef.current = btn;
        }
      }
    };

    window.addEventListener('focusin', trackFocus, true);
    window.addEventListener('click', trackClick, true);
    return () => {
      window.removeEventListener('focusin', trackFocus, true);
      window.removeEventListener('click', trackClick, true);
    };
  }, []);

  // Capture triggering external opener element strictly on isOpen transition
  useLayoutEffect(() => {
    if (isOpen) {
      const active = document.activeElement as HTMLElement;
      if (
        isValidTarget(active) &&
        (!containerRef.current || !containerRef.current.contains(active))
      ) {
        openerRef.current = active;
      } else if (isValidTarget(lastActiveOpenerRef.current)) {
        openerRef.current = lastActiveOpenerRef.current;
      }
    } else {
      const targetOpener =
        isValidTarget(openerRef.current) ? openerRef.current :
        isValidTarget(lastActiveOpenerRef.current) ? lastActiveOpenerRef.current :
        null;
      if (targetOpener) {
        targetOpener.focus();
      }
      openerRef.current = null;
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(() => {
      if (!containerRef.current) return;
      const focusables = getFocusableElements(containerRef.current);
      if (focusables.length > 0) {
        focusables[0].focus();
      } else {
        containerRef.current.focus();
      }
    }, 16);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!containerRef.current) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        const targetOpener =
          isValidTarget(openerRef.current) ? openerRef.current :
          isValidTarget(lastActiveOpenerRef.current) ? lastActiveOpenerRef.current :
          null;
        onCloseRef.current();
        if (targetOpener) {
          targetOpener.focus();
        }
        return;
      }

      if (e.key === 'Tab') {
        const focusables = getFocusableElements(containerRef.current);
        if (focusables.length === 0) {
          e.preventDefault();
          containerRef.current.focus();
          return;
        }

        e.preventDefault();
        e.stopPropagation();

        const active = document.activeElement as HTMLElement;
        let currentIndex = focusables.indexOf(active);
        if (currentIndex === -1) {
          const closestFocusable = focusables.find((el) => el === active || el.contains(active));
          if (closestFocusable) {
            currentIndex = focusables.indexOf(closestFocusable);
          }
        }

        let nextIndex: number;
        if (e.shiftKey) {
          nextIndex = currentIndex <= 0 ? focusables.length - 1 : currentIndex - 1;
        } else {
          nextIndex = currentIndex === -1 || currentIndex >= focusables.length - 1 ? 0 : currentIndex + 1;
        }

        const target = focusables[nextIndex];
        if (isValidTarget(target)) {
          target.focus();
        } else {
          containerRef.current.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen]);

  return containerRef;
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const selector =
    'a[href], button:not([disabled]), input:not([type="file"]):not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])';
  const elements = Array.from(container.querySelectorAll<HTMLElement>(selector));
  return elements.filter((el) => {
    const style = window.getComputedStyle(el);
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      (el.offsetWidth > 1 || el.offsetHeight > 1 || el.getClientRects().length > 0)
    );
  });
}
