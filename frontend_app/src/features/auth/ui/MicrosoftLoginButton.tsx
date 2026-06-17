import { useState } from "react";
import { Loader2 } from "lucide-react";

import { MicrosoftIcon } from "@/components/MicrosoftIcon";
import { Button } from "@/components/ui/button";

export interface MicrosoftLoginButtonProps {
  onLogin: () => Promise<void>;
  disabled?: boolean;
  className?: string;
}

export function MicrosoftLoginButton({
  onLogin,
  disabled = false,
  className = "",
}: MicrosoftLoginButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setIsLoading(true);
    setError(null);

    try {
      await onLogin();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <Button
        onClick={handleClick}
        disabled={disabled || isLoading}
        aria-busy={isLoading}
        aria-label="Sign in with Microsoft"
        className="flex h-12 min-w-[320px] items-center justify-center gap-3 px-8 text-base"
        variant="outline"
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span>Signing in...</span>
          </>
        ) : (
          <>
            <MicrosoftIcon />
            <span>Sign in with Microsoft</span>
          </>
        )}
      </Button>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
