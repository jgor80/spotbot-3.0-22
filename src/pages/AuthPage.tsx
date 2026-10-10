import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Shield, AlertCircle } from "lucide-react";
import { z } from "zod";
import { lovable } from "@/integrations/lovable/index";
import { supabase } from "@/integrations/supabase/client";

const authSchema = z.object({
  email: z.string().trim().email({ message: "Invalid email address" }),
  password: z.string().min(6, { message: "Password must be at least 6 characters" }),
});

export default function AuthPage() {
  const navigate = useNavigate();
  const { signIn, signUp, user, isLoading: authLoading } = useAuth();
  const rawNext = new URLSearchParams(window.location.search).get("next") || "/";
  const nextPath = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Redirect if already logged in
  if (user && !authLoading) {
    navigate(nextPath);
    return null;
  }

  const validateForm = () => {
    const result = authSchema.safeParse({ email, password });
    if (!result.success) {
      setError(result.error.errors[0].message);
      return false;
    }
    return true;
  };

  const handleDiscord = async () => {
    setError(null);
    setIsLoading(true);
    const { data, error } = await supabase.functions.invoke("auth-discord", { method: "GET" });
    if (error || !data?.client_id) {
      setIsLoading(false);
      setError("Discord sign-in isn't set up yet.");
      return;
    }
    const state = crypto.randomUUID();
    sessionStorage.setItem("discord_oauth_state", state);
    sessionStorage.setItem("auth_next", nextPath);
    const params = new URLSearchParams({
      client_id: data.client_id,
      response_type: "code",
      scope: "identify connections",
      redirect_uri: `${window.location.origin}/auth/callback`,
      state,
      prompt: "none",
    });
    window.location.href = `https://discord.com/oauth2/authorize?${params}`;
  };

  const handleOAuth = async (provider: "google" | "microsoft") => {
    setError(null);
    setIsLoading(true);
    const result = await lovable.auth.signInWithOAuth(provider, {
      redirect_uri: window.location.origin,
    });
    setIsLoading(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    if (result.redirected) return; // Browser is heading to the provider
    navigate(nextPath);
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!validateForm()) return;

    setIsLoading(true);
    const { error } = await signIn(email.trim(), password);
    setIsLoading(false);

    if (error) {
      if (error.message.includes("Invalid login credentials")) {
        setError("Invalid email or password. Please try again.");
      } else {
        setError(error.message);
      }
    } else {
      navigate(nextPath);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!validateForm()) return;

    setIsLoading(true);
    const { error } = await signUp(email.trim(), password);
    setIsLoading(false);

    if (error) {
      if (error.message.includes("already registered")) {
        setError("This email is already registered. Please sign in instead.");
      } else {
        setError(error.message);
      }
    } else {
      setSuccess("Account created! You can now sign in.");
      navigate(nextPath);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold">GafferBot</CardTitle>
          <CardDescription>
            Sign in to run your club: lineups, stats and match night
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 mb-4">
            <Button
              type="button"
              className="w-full"
              disabled={isLoading}
              onClick={handleDiscord}
            >
              Continue with Discord
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={isLoading}
              onClick={() => handleOAuth("google")}
            >
              Continue with Google
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={isLoading}
              onClick={() => handleOAuth("microsoft")}
            >
              Continue with Microsoft / Xbox
            </Button>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">or with email</span>
              </div>
            </div>
          </div>
          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>
            
            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signin-email">Email</Label>
                  <Input
                    id="signin-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signin-password">Password</Label>
                  <Input
                    id="signin-password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                </div>
                
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    "Sign In"
                  )}
                </Button>
              </form>
            </TabsContent>
            
            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    autoComplete="new-password"
                  />
                  <p className="text-xs text-muted-foreground">
                    Must be at least 6 characters
                  </p>
                </div>
                
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {success && (
                  <Alert className="border-green-500/50 bg-green-500/10">
                    <AlertDescription className="text-green-600">{success}</AlertDescription>
                  </Alert>
                )}

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating account...
                    </>
                  ) : (
                    "Create Account"
                  )}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
        <p className="pb-6 text-center text-xs text-muted-foreground">
          <a href="/terms" className="underline hover:text-foreground">Terms of Service</a>
          {" · "}
          <a href="/privacy" className="underline hover:text-foreground">Privacy Policy</a>
        </p>
      </Card>
    </div>
  );
}
