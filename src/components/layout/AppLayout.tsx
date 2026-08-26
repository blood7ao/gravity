import React from 'react';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { LeftSidebar } from './LeftSidebar';
import { TopHeader } from './TopHeader';
import { ChatCanvas } from '@/components/canvas/ChatCanvas';
import { InspectorDrawer } from '@/components/inspector/InspectorDrawer';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { useAgySession } from '@/hooks/useAgySession';

export function AppLayout() {
  // Connect background listeners for agy stdout, stderr and brain watcher
  useAgySession();

  const isInspectorOpen = useWorkspaceStore((s) => s.isInspectorOpen);

  return (
    <div className="flex flex-col h-screen w-screen bg-white text-zinc-900 dark:bg-[#121215] dark:text-zinc-100 overflow-hidden select-none">
      {/* Top Header */}
      <TopHeader />

      {/* Main Split Body */}
      <div className="flex-1 flex overflow-hidden">
        <PanelGroup direction="horizontal" className="h-full w-full">
          {/* Left Navigation & Sessions */}
          <Panel
            defaultSize={18}
            minSize={14}
            maxSize={28}
            className="border-r border-zinc-200/90 dark:border-zinc-800/80 bg-zinc-50/70 dark:bg-zinc-950/70"
          >
            <LeftSidebar />
          </Panel>

          <PanelResizeHandle className="w-[1px] bg-zinc-200/90 dark:bg-zinc-800/80 hover:bg-zinc-400 dark:hover:bg-zinc-600 transition-colors cursor-col-resize" />

          {/* Center Chat & Reasoning Canvas */}
          <Panel
            defaultSize={isInspectorOpen ? 48 : 82}
            minSize={35}
            className="flex flex-col bg-white dark:bg-[#121215]"
          >
            <ChatCanvas />
          </Panel>

          {/* Right Inspector Drawer (Plan & Monaco Diff) */}
          {isInspectorOpen && (
            <>
              <PanelResizeHandle className="w-[1px] bg-zinc-200/90 dark:bg-zinc-800/80 hover:bg-zinc-400 dark:hover:bg-zinc-600 transition-colors cursor-col-resize" />
              <Panel
                defaultSize={34}
                minSize={25}
                maxSize={55}
                className="bg-white dark:bg-zinc-950"
              >
                <InspectorDrawer />
              </Panel>
            </>
          )}
        </PanelGroup>
      </div>
    </div>
  );
}
