"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CheckCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { isMockMode } from "@/lib/env";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (isMockMode()) {
        setSent(true);
        toast.success("Password reset email sent (mock mode)");
        return;
      }
      const supabase = createClient();
      if (!supabase) {
        toast.error("Authentication service unavailable");
        return;
      }
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/update-password`,
      });
      if (error) {
        toast.error(error.message);
      } else {
        setSent(true);
        toast.success("Password reset email sent");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold text-xl">
          B
        </div>
        <CardTitle className="text-xl">Reset your password</CardTitle>
        <p className="text-sm text-muted-foreground">
          Enter your email and we&apos;ll send you a reset link
        </p>
      </CardHeader>
      <CardContent>
        {sent ? (
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <CheckCircle className="size-12 text-green-500" />
            <div>
              <p className="font-medium">Check your inbox</p>
              <p className="mt-1 text-sm text-muted-foreground">
                We sent a password reset link to{" "}
                <span className="font-medium">{email}</span>
              </p>
            </div>
            <Link href="/login">
              <Button variant="outline">Back to sign in</Button>
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Sending…" : "Send Reset Link"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              <Link
                href="/login"
                className="text-primary hover:underline underline-offset-4"
              >
                Back to sign in
              </Link>
            </p>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
