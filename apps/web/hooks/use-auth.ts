"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isMockMode } from "@/lib/env";
import { createClient } from "@/lib/supabase/client";
import { mockUser } from "@/lib/mock/data";

interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export function useAuth() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(isMockMode() ? mockUser : null);
  const [loading, setLoading] = useState(!isMockMode());

  useEffect(() => {
    if (isMockMode()) return;

    const supabase = createClient();
    if (!supabase) {
      setLoading(false);
      return;
    }

    supabase.auth.getUser().then(({ data: { user: sbUser } }) => {
      if (sbUser) {
        setUser({
          id: sbUser.id,
          email: sbUser.email ?? "",
          name: (sbUser.user_metadata?.name as string) ?? "",
        });
      }
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser({
          id: session.user.id,
          email: session.user.email ?? "",
          name: (session.user.user_metadata?.name as string) ?? "",
        });
      } else {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function signOut() {
    if (isMockMode()) {
      window.location.href = "/login";
      return;
    }
    const supabase = createClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    router.push("/login");
  }

  return { user, loading, isAuthenticated: !!user, signOut };
}
