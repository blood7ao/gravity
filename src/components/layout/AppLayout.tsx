import React, { useState, useCallback, useRef, useEffect } from 'react';
import { LeftSidebar } from './LeftSidebar';
import { TopHeader } from './TopHeader';
import { ChatCanvas } from '@/components/canvas/ChatCanvas';
import { InspectorDrawer } from '@/components/inspector/InspectorDrawer';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { useAgySession } from '@/hooks/useAgySession';

const DEFAULT_SIDEBAR_WIDTH = 256;
const MIN_SIDEBAR_WIDTH = 190;
const MAX_SIDEBAR_WIDTH = 380;

const DEFAULT_INSPECTOR_WIDTH = 480;
const MIN_INSPECTOR_WIDTH = 340;

// Minimum usable width reserved for the center ChatCanvas while the inspector
// is open, used to bound the inspector width (both on initial load and during
// drag) so a large saved width never squashes the center pane to 0px.
const MIN_CENTER_WIDTH = 360;

export function AppLayout() {
  // Connect background listeners for agy stdout, stderr and brain watcher
  useAgySession();

  const isInspectorOpen = useWorkspaceStore((s) => s.isInspectorOpen);
  const isInspectorFullscreen = useWorkspaceStore((s) => s.isInspectorFullscreen);

  // Persistent sidebar width (independent from inspector state)
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const saved = localStorage.getItem('gravity_sidebar_width');
    const parsed = saved ? parseInt(saved, 10) : DEFAULT_SIDEBAR_WIDTH;
    return isNaN(parsed)
      ? DEFAULT_SIDEBAR_WIDTH
      : Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, parsed));
  });

  // Persistent inspector width
  const [inspectorWidth, setInspectorWidth] = useState<number>(() => {
    const saved = localStorage.getItem('gravity_inspector_width');
    const parsed = saved ? parseInt(saved, 10) : DEFAULT_INSPECTOR_WIDTH;

    let maxW = DEFAULT_INSPECTOR_WIDTH;
    if (typeof window !== 'undefined') {
      // Bound the inspector relative to the current viewport, accounting for
      // the (already clamped) sidebar width plus a usable minimum ChatCanvas
      // width, so a huge value saved on an ultra-wide monitor can never
      // eclipse the center pane when the workspace reopens on a smaller screen.
      maxW = Math.max(
        MIN_INSPECTOR_WIDTH,
        window.innerWidth - sidebarWidth - MIN_CENTER_WIDTH
      );
    }

    return isNaN(parsed)
      ? DEFAULT_INSPECTOR_WIDTH
      : Math.max(MIN_INSPECTOR_WIDTH, Math.min(maxW, parsed));
  });

  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [isResizingInspector, setIsResizingInspector] = useState(false);

  const resizeCleanup = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      if (resizeCleanup.current) {
        resizeCleanup.current();
      }
    };
  }, []);

  // Handle Left Sidebar Resize Drag
  const handleSidebarMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingSidebar(true);
    let currentW = sidebarWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      currentW = Math.max(
        MIN_SIDEBAR_WIDTH,
        Math.min(MAX_SIDEBAR_WIDTH, moveEvent.clientX)
      );
      setSidebarWidth(currentW);
    };

    const onMouseUp = () => {
      setIsResizingSidebar(false);
      localStorage.setItem('gravity_sidebar_width', currentW.toString());
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      resizeCleanup.current = null;
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    resizeCleanup.current = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [sidebarWidth]);

  // Handle Right Inspector Resize Drag
  const handleInspectorMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizingInspector(true);
      let currentW = inspectorWidth;

      const onMouseMove = (moveEvent: MouseEvent) => {
        const maxInspectorWidth =
          window.innerWidth - sidebarWidth - MIN_CENTER_WIDTH;
        currentW = Math.max(
          MIN_INSPECTOR_WIDTH,
          Math.min(maxInspectorWidth, window.innerWidth - moveEvent.clientX)
        );
        setInspectorWidth(currentW);
      };

      const onMouseUp = () => {
        setIsResizingInspector(false);
        localStorage.setItem('gravity_inspector_width', currentW.toString());
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        resizeCleanup.current = null;
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
      resizeCleanup.current = () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };
    },
    [sidebarWidth, inspectorWidth]
  );

  return (
    <div
      className={`flex flex-col h-screen w-screen bg-white text-zinc-900 dark:bg-[#121215] dark:text-zinc-100 overflow-hidden select-none relative ${
        isResizingSidebar || isResizingInspector ? 'cursor-col-resize select-none' : ''
      }`}
    >
      {/* Top Header */}
      <TopHeader />

      {/* Main Body */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Navigation & Sessions Sidebar (Fixed width, never affected by right inspector) */}
        <div
          style={{ width: `${sidebarWidth}px` }}
          className="h-full shrink-0 flex flex-col bg-zinc-50/70 dark:bg-zinc-950/70 z-10 relative"
        >
          <LeftSidebar />
        </div>

        {/* Sidebar Resize Handle (Subtle 1px border with comfortable hit zone) */}
        <div
          onMouseDown={handleSidebarMouseDown}
          className="group relative w-0 shrink-0 z-20 cursor-col-resize"
        >
          <div className="absolute inset-y-0 -left-1 w-2 cursor-col-resize hover:bg-purple-500/20 active:bg-purple-500/40 transition-colors" />
          <div className="absolute inset-y-0 left-0 w-[1px] bg-zinc-200 dark:bg-zinc-800/80 group-hover:bg-purple-500/60 dark:group-hover:bg-purple-400/60 transition-colors" />
        </div>

        {/* Center Chat & Reasoning Canvas (Fluids cleanly between sidebar and inspector) */}
        <div className="flex-1 min-w-0 flex flex-col bg-white dark:bg-[#121215] relative z-0">
          <ChatCanvas />
        </div>

        {/* Right Inspector Resize Handle (when open in split mode) */}
        {isInspectorOpen && !isInspectorFullscreen && (
          <div
            onMouseDown={handleInspectorMouseDown}
            className="group relative w-0 shrink-0 z-20 cursor-col-resize"
          >
            <div className="absolute inset-y-0 -left-1 w-2 cursor-col-resize hover:bg-purple-500/20 active:bg-purple-500/40 transition-colors" />
            <div className="absolute inset-y-0 left-0 w-[1px] bg-zinc-200 dark:bg-zinc-800/80 group-hover:bg-purple-500/60 dark:group-hover:bg-purple-400/60 transition-colors" />
          </div>
        )}

        {/* Right Inspector Drawer (Split mode with Apple-style smooth slide & width transition) */}
        <div
          style={{
            width: isInspectorOpen && !isInspectorFullscreen ? `${inspectorWidth}px` : '0px',
          }}
          className={`h-full shrink-0 overflow-hidden bg-white dark:bg-zinc-950 z-10 ${
            isResizingInspector
              ? 'transition-none'
              : 'transition-[width,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]'
          } ${
            isInspectorOpen && !isInspectorFullscreen
              ? 'opacity-100'
              : 'opacity-0 pointer-events-none'
          }`}
        >
          <div style={{ width: `${inspectorWidth}px` }} className="h-full">
            {!isInspectorFullscreen && <InspectorDrawer />}
          </div>
        </div>

        {/* Fullscreen Inspector Overlay (Apple-style spring scale & fade-in) */}
        {isInspectorOpen && isInspectorFullscreen && (
          <div className="absolute inset-0 z-30 bg-white dark:bg-zinc-950 flex flex-col animate-in fade-in-0 zoom-in-[0.985] duration-250 ease-[cubic-bezier(0.16,1,0.3,1)] shadow-2xl">
            <InspectorDrawer />
          </div>
        )}
      </div>
    </div>
  );
}
