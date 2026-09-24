'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';

export interface UseBottomSheetDragOptions {
  onClose: () => void;
  threshold?: number;
  isOpen?: boolean;
}

export function useBottomSheetDrag({
  onClose,
  threshold = 70,
  isOpen = true,
}: UseBottomSheetDragOptions) {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 640;
    }
    return false;
  });
  const [isClosing, setIsClosing] = useState(false);

  const sheetRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const startYRef = useRef(0);
  const lastYRef = useRef(0);
  const lastTimeRef = useRef(0);
  const velocityRef = useRef(0);
  const isDraggingRef = useRef(false);
  const currentDragYRef = useRef(0);
  const isAtTopRef = useRef(true);

  // Check mobile viewport (< 640px)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Dismiss keyboard immediately when bottom sheet opens on mobile
  useEffect(() => {
    if (isOpen) {
      const isSmall = typeof window !== 'undefined' ? window.innerWidth < 640 : false;
      if (isSmall && document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
        document.activeElement.blur();
      }
    }
  }, [isOpen]);

  // Smooth dismiss animation (slide down and unmount)
  const animateDismiss = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);

    if (isMobile && sheetRef.current) {
      sheetRef.current.style.animation = 'none';
      sheetRef.current.style.transition = 'transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)';
      sheetRef.current.style.transform = 'translateY(100%)';
      if (backdropRef.current) {
        backdropRef.current.style.transition = 'opacity 0.22s ease-out';
        backdropRef.current.style.opacity = '0';
      }
      setTimeout(() => {
        onClose();
        setIsClosing(false);
      }, 220);
    } else {
      onClose();
    }
  }, [isClosing, isMobile, onClose]);

  // Snap back animation when drag canceled
  const animateSnapBack = useCallback(() => {
    if (!sheetRef.current) return;
    sheetRef.current.style.animation = 'none';
    sheetRef.current.style.transition = 'transform 0.24s cubic-bezier(0.16, 1, 0.3, 1)';
    sheetRef.current.style.transform = 'translateY(0)';
    if (backdropRef.current) {
      backdropRef.current.style.transition = 'opacity 0.24s ease-out';
      backdropRef.current.style.opacity = '1';
    }
    currentDragYRef.current = 0;
  }, []);

  // Start dragging
  const startDrag = useCallback((clientY: number) => {
    if (!isMobile || isClosing) return false;
    startYRef.current = clientY;
    lastYRef.current = clientY;
    lastTimeRef.current = Date.now();
    velocityRef.current = 0;
    isDraggingRef.current = true;
    currentDragYRef.current = 0;

    if (sheetRef.current) {
      sheetRef.current.style.animation = 'none';
      sheetRef.current.style.transition = 'none';
    }
    if (backdropRef.current) {
      backdropRef.current.style.transition = 'none';
    }
    return true;
  }, [isMobile, isClosing]);

  // Move drag
  const moveDrag = useCallback((clientY: number) => {
    if (!isDraggingRef.current || !sheetRef.current) return;
    const now = Date.now();
    const dt = now - lastTimeRef.current;
    const dy = clientY - lastYRef.current;
    if (dt > 0) {
      velocityRef.current = dy / dt;
    }
    lastYRef.current = clientY;
    lastTimeRef.current = now;

    const totalDelta = clientY - startYRef.current;
    let targetY = 0;
    if (totalDelta > 0) {
      targetY = totalDelta;
    } else {
      // Elastic rubber-band resistance when pulling up
      targetY = totalDelta * 0.2;
    }

    currentDragYRef.current = targetY;
    sheetRef.current.style.transform = `translateY(${targetY}px)`;

    if (backdropRef.current && targetY > 0) {
      const opacity = Math.max(0, 1 - targetY / 320);
      backdropRef.current.style.opacity = String(opacity);
    }
  }, []);

  // End drag
  const endDrag = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;

    const delta = currentDragYRef.current;
    const velocity = velocityRef.current;

    // Dismiss if dragged down beyond threshold OR flicked down with velocity
    if (delta > threshold || (delta > 20 && velocity > 0.3)) {
      animateDismiss();
    } else {
      animateSnapBack();
    }
  }, [threshold, animateDismiss, animateSnapBack]);

  // Pointer event handlers for drag handle & header
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target?.closest('button') || target?.closest('a') || target?.closest('input')) {
      return;
    }
    if (startDrag(e.clientY)) {
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {}
    }
  }, [startDrag]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    moveDrag(e.clientY);
  }, [moveDrag]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
    endDrag();
  }, [endDrag]);

  // Touch handlers for content list (pull-down when scrolled to top)
  const handleContentTouchStart = useCallback((e: React.TouchEvent) => {
    if (contentRef.current) {
      isAtTopRef.current = contentRef.current.scrollTop <= 0;
    }
    if (isAtTopRef.current && e.touches.length > 0) {
      startYRef.current = e.touches[0].clientY;
    }
  }, []);

  const handleContentTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isMobile || e.touches.length === 0) return;
    if (contentRef.current) {
      isAtTopRef.current = contentRef.current.scrollTop <= 0;
    }
    if (!isAtTopRef.current) return;

    const clientY = e.touches[0].clientY;
    const delta = clientY - startYRef.current;

    if (delta > 8 && !isDraggingRef.current) {
      startDrag(clientY);
    }

    if (isDraggingRef.current) {
      if (delta > 0) {
        moveDrag(clientY);
      } else {
        isDraggingRef.current = false;
        animateSnapBack();
      }
    }
  }, [isMobile, startDrag, moveDrag, animateSnapBack]);

  const handleContentTouchEnd = useCallback(() => {
    if (isDraggingRef.current) {
      endDrag();
    }
  }, [endDrag]);

  const dragHandleProps = {
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
    onPointerCancel: handlePointerUp,
    style: {
      touchAction: 'none' as const,
      cursor: isMobile ? 'grab' : 'default',
    },
  };

  const contentProps = {
    ref: contentRef,
    onTouchStart: handleContentTouchStart,
    onTouchMove: handleContentTouchMove,
    onTouchEnd: handleContentTouchEnd,
  };

  return {
    isMobile,
    isClosing,
    sheetRef,
    backdropRef,
    contentRef,
    dragHandleProps,
    contentProps,
    animateDismiss,
  };
}

export interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  badge?: React.ReactNode;
  children: React.ReactNode;
  /**
   * Tailwind classes for desktop anchored popover & mobile bottom sheet.
   * Example: "sm:absolute sm:bottom-full sm:left-0 sm:mb-2 sm:w-64"
   */
  className?: string;
  zIndex?: number;
  showCloseButton?: boolean;
  dragHandle?: boolean;
  threshold?: number;
  /**
   * If true, renders via createPortal(..., document.body).
   * Defaults to `true` on mobile (< sm) so the sheet breaks free of any
   * ancestor transforms/drawers/overflows, and `false` on desktop.
   */
  portal?: boolean;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  title,
  badge,
  children,
  className = '',
  zIndex = 1000,
  showCloseButton = true,
  dragHandle = true,
  threshold = 70,
  portal,
}) => {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const isClosingRef = useRef(false);
  const [mounted, setMounted] = useState(false);
  const anchorRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const {
    isMobile,
    sheetRef,
    backdropRef,
    contentRef,
    dragHandleProps,
    contentProps,
    animateDismiss,
  } = useBottomSheetDrag({
    onClose: () => {
      setShouldRender(false);
      isClosingRef.current = false;
      onClose();
    },
    threshold,
    isOpen,
  });

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      isClosingRef.current = false;
    } else if (shouldRender && !isClosingRef.current) {
      if (isMobile) {
        isClosingRef.current = true;
        animateDismiss();
      } else {
        setShouldRender(false);
      }
    }
  }, [isOpen, shouldRender, isMobile, animateDismiss]);

  // Desktop Outside Click & Escape key dismissal
  useEffect(() => {
    if (isMobile || !isOpen) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      if (!target || !sheetRef.current) return;
      if (sheetRef.current.contains(target)) return;

      // Do not close on pointerdown if clicking a sibling trigger button inside the same dropdown wrapper,
      // allowing the button's onClick handler to cleanly toggle the state to closed instead of re-opening.
      const wrapperEl = anchorRef.current?.parentElement || sheetRef.current.parentElement;
      if (wrapperEl && wrapperEl !== document.body && wrapperEl.contains(target)) {
        return;
      }

      // Do not close on pointerdown if clicking inside a portaled floating popover (e.g. Upgrade Plan card)
      if (target instanceof Element && target.closest('[data-floating-popover="true"]')) {
        return;
      }

      onClose();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMobile, isOpen, onClose]);

  if (!shouldRender) return null;

  const backdropZ = zIndex - 1;

  const content = (
    <>
      {/* Mobile Backdrop (Mobile Only: never on Desktop) */}
      {isMobile && (
        <div
          ref={backdropRef}
          style={{ zIndex: backdropZ }}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs animate-fade-in cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            animateDismiss();
          }}
        />
      )}

      {/* Sheet on mobile (< sm), Popover on desktop (sm:) */}
      <div
        ref={sheetRef}
        style={{ zIndex }}
        onClick={(e) => e.stopPropagation()}
        className={
          isMobile
            ? `fixed inset-x-0 bottom-0 rounded-t-2xl shadow-2xl flex flex-col pb-[max(1.5rem,env(safe-area-inset-bottom))] animate-sheet-up ${className}`
            : `absolute rounded-xl shadow-2xl flex flex-col pb-1 animate-dropdown ${className}`
        }
      >
        {/* Drag Handle & Header (Mobile Only) */}
        {isMobile && (
          <div {...dragHandleProps} className="select-none touch-none shrink-0 cursor-grab active:cursor-grabbing">
            {dragHandle && (
              <div className="py-2.5 px-6 mx-auto flex items-center justify-center shrink-0">
                <div className="w-12 h-1.5 rounded-full bg-[#52525c] active:bg-[#7e7e8a] transition-colors" />
              </div>
            )}

            {(title || badge || showCloseButton) && (
              <div className="px-4 py-2 text-[11.5px] font-semibold text-[#8c8c8c] border-b border-[#262626] uppercase tracking-wider flex items-center justify-between">
                <span className="truncate">{title}</span>
                <div className="flex items-center gap-2 shrink-0">
                  {badge}
                  {showCloseButton && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        animateDismiss();
                      }}
                      className="text-sm text-[#8c8c8c] hover:text-white p-1 cursor-pointer transition-colors"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Content (Scrollable) */}
        <div {...contentProps} className="w-full flex-1 overflow-y-auto min-h-0 overscroll-contain">
          {children}
        </div>
      </div>
    </>
  );

  // When on mobile, or when portal is explicitly requested, render into document.body.
  // This guarantees that the bottom sheet and backdrop are never clipped or trapped
  // inside an ancestor with transform: translateX (e.g. mobile sidebar drawers), contain, or overflow.
  const shouldPortal = portal !== undefined ? portal : isMobile;

  if (shouldPortal && mounted && typeof document !== 'undefined') {
    return (
      <>
        <span ref={anchorRef} className="hidden" aria-hidden="true" />
        {createPortal(content, document.body)}
      </>
    );
  }

  return (
    <>
      <span ref={anchorRef} className="hidden" aria-hidden="true" />
      {content}
    </>
  );
};
