import type { Metadata, Viewport } from 'next';
import './globals.css';
import '@xterm/xterm/css/xterm.css';
import { ConfirmProvider } from '@/context/confirm-context';
import { AestheticTooltipProvider } from '@/components/common/aesthetic-tooltip';
import { GlobalContextMenuDisabler } from '@/components/common/context-menu-disabler';
import { ThemeProvider } from '@/context/theme-context';
import { CustomTitlebar } from '@/components/desktop/custom-titlebar';

export const metadata: Metadata = {
  title: 'Aidev Desktop Coding Agent',
  description: 'Ultra-lightweight autonomous local desktop coding agent',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body suppressHydrationWarning className="fixed inset-0 w-full h-full max-w-[100vw] bg-[var(--background)] text-[var(--foreground)] antialiased overflow-hidden select-none flex flex-col">
        <CustomTitlebar />
        <div className="flex-1 min-h-0 relative w-full h-full">
          <GlobalContextMenuDisabler />
          <ThemeProvider>
            <ConfirmProvider>
              <AestheticTooltipProvider>
                {children}
              </AestheticTooltipProvider>
            </ConfirmProvider>
          </ThemeProvider>
        </div>
      </body>
    </html>
  );
}
