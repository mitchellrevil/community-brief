import { startTransition, useEffect, useMemo } from "react";
import { useRouter } from "@tanstack/react-router";

import { getRedirectPathFromSearch } from "../lib/navigation";
import { useAuthSession } from "../hooks/useAuthSession";
import { LoginForm } from "./LoginForm";

export function LoginPage() {
  const router = useRouter();
  const auth = useAuthSession();
  const redirectPath = useMemo(
    () => getRedirectPathFromSearch(window.location.search),
    [],
  );

  useEffect(() => {
    if (auth.status !== "authenticated") {
      return;
    }

    startTransition(() => {
      void router.navigate({
        to: redirectPath || "/simple-upload",
        replace: true,
      });
    });
  }, [auth.status, redirectPath, router]);

  if (auth.status === "loading") {
    return (
      <div className="bg-background flex min-h-screen items-center justify-center p-4">
        <div className="text-sm text-muted-foreground">Checking your session...</div>
      </div>
    );
  }

  if (auth.status === "authenticated") {
    return null;
  }

  return (
    <div className="bg-background flex min-h-screen items-center justify-center p-4">
      <LoginForm />
    </div>
  );
}