import { Outlet, createRootRouteWithContext } from "@tanstack/react-router";
import { allThemeIds } from "../lib/themes";
import type { QueryClient } from "@tanstack/react-query";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { ErrorBoundary } from "@/components/error-boundary";


interface MyRouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  component: () => (
    <>
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        themes={allThemeIds}
        enableSystem
        disableTransitionOnChange
      >
        <Outlet />
        <Toaster />
      </ThemeProvider>
    </>
  ),
  errorComponent: ({ error }) => (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      themes={allThemeIds}
      enableSystem
      disableTransitionOnChange
    >
      <div className="min-h-screen flex items-center justify-center p-4">
        <ErrorBoundary error={error} isRouteError={true} />
      </div>
    </ThemeProvider>
  ),
});
