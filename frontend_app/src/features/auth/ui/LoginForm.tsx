import { InteractionStatus } from "@azure/msal-browser";
import { startTransition, useMemo, useState } from "react";
import { useRouter } from "@tanstack/react-router";

import { useAuthActions } from "../hooks/useAuthActions";
import { getRedirectPathFromSearch } from "../lib/navigation";
import { MicrosoftLoginButton } from "./MicrosoftLoginButton";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { normalizeError } from "@/lib/errors";


export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showCredentials, setShowCredentials] = useState(false);
  const { toast } = useToast();
  const router = useRouter();
  const { signInWithCredentials, signInWithMicrosoft, isMicrosoftConfigured, msalInProgress } =
    useAuthActions();

  const redirectPath = useMemo(
    () => getRedirectPathFromSearch(window.location.search),
    [],
  );

  const navigateToDestination = (destination: string) => {
    startTransition(() => {
      void router.navigate({ to: destination, replace: true });
    });
  };

  const handleCredentialSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);

    try {
      await signInWithCredentials(email, password);
      toast({
        title: "Login successful",
        description: "You have been successfully logged in.",
      });
      navigateToDestination(redirectPath || "/simple-upload");
    } catch (error) {
      toast({
        title: "Login failed",
        description: normalizeError(error).userMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleMicrosoftLogin = async () => {
    const overrideInteractionInProgress =
      msalInProgress !== InteractionStatus.None;

    await signInWithMicrosoft({ overrideInteractionInProgress });

    toast({
      title: "Login successful",
      description: "Your Microsoft account has been connected.",
    });

    navigateToDestination(redirectPath || "/simple-upload");
  };

  return (
    <Card className="w-full max-w-sm sm:max-w-md">
      <CardHeader>
        <CardTitle>Welcome Back</CardTitle>
        <CardDescription>Sign in to your account to continue</CardDescription>
      </CardHeader>

      <CardContent>
        <div className="space-y-6">
          <div>
            <h3 className="mb-4 text-sm font-semibold">
              Recommended: Sign in with Microsoft
            </h3>
            <MicrosoftLoginButton
              onLogin={handleMicrosoftLogin}
              disabled={!isMicrosoftConfigured}
            />
            {!isMicrosoftConfigured ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Microsoft sign-in is not configured for this environment.
              </p>
            ) : null}
          </div>

          <Button
            type="button"
            variant="ghost"
            className="w-full justify-between"
            onClick={() => setShowCredentials((value) => !value)}
          >
            <span>Alternative: Sign in with credentials</span>
            <span className={`transition-transform ${showCredentials ? "rotate-180" : ""}`}>
              ▼
            </span>
          </Button>

          {showCredentials ? (
            <div className="border-t pt-6">
              <form onSubmit={handleCredentialSubmit}>
                <div className="grid w-full items-center gap-4">
                  <div className="flex flex-col space-y-1.5">
                    <Label htmlFor="username">Username</Label>
                    <Input
                      id="username"
                      placeholder="Enter your username"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                    />
                  </div>
                  <div className="flex flex-col space-y-1.5">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  variant="outline"
                  className="mt-4 w-full"
                  disabled={isLoading}
                >
                  {isLoading ? "Signing in..." : "Sign In with Credentials"}
                </Button>
              </form>
            </div>
          ) : null}
        </div>
      </CardContent>

      <CardFooter className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => navigateToDestination("/")}>Cancel</Button>
      </CardFooter>
    </Card>
  );
}