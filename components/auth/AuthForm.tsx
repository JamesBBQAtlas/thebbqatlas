"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type AuthMode = "login" | "signup" | "magic";

export function AuthForm({ mode: initialMode = "login" }: { mode?: AuthMode }) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      setMessage(error ? error.message : "Check your email to confirm your account.");
    } else if (mode === "magic") {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      setMessage(error ? error.message : "Magic link sent — check your email.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMessage(error.message);
      else window.location.href = "/profile";
    }
    setLoading(false);
  };

  const handleGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>
          {mode === "signup" ? "Create Account" : mode === "magic" ? "Magic Link" : "Sign In"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleEmailAuth} className="space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          {mode !== "magic" && (
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </div>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Loading..." : mode === "signup" ? "Sign Up" : mode === "magic" ? "Send Magic Link" : "Sign In"}
          </Button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-white/20" /></div>
          <div className="relative flex justify-center text-xs"><span className="bg-brand-black px-2 text-white/50">or</span></div>
        </div>

        <Button variant="secondary" className="w-full" onClick={handleGoogle} type="button">
          Continue with Google
        </Button>

        <div className="flex flex-wrap gap-2 text-sm text-white/60 justify-center">
          {mode !== "login" && <button type="button" onClick={() => setMode("login")} className="hover:text-brand-gold">Sign In</button>}
          {mode !== "signup" && <button type="button" onClick={() => setMode("signup")} className="hover:text-brand-gold">Sign Up</button>}
          {mode !== "magic" && <button type="button" onClick={() => setMode("magic")} className="hover:text-brand-gold">Magic Link</button>}
        </div>

        {message && <p className="text-sm text-center text-brand-gold">{message}</p>}
      </CardContent>
    </Card>
  );
}