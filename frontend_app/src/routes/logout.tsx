import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuthActions } from "@/features/auth/hooks/useAuthActions";

function LogoutPage() {
  const { signOut } = useAuthActions();

  useEffect(() => {
    void signOut().then(() => {
      window.location.replace("/login");
    });
  }, [signOut]);

  return <div>Logging out...</div>;
}

export const Route = createFileRoute("/logout")({
  component: LogoutPage,
});
