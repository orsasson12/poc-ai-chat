"use client";

import { useState } from "react";
import { isMockMode } from "@/lib/env";
import { mockUser } from "@/lib/mock/data";

interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export function useMockAuth() {
  const [user] = useState<AuthUser | null>(isMockMode() ? mockUser : null);
  const isAuthenticated = !!user;

  return {
    user,
    isAuthenticated,
    isMockMode: isMockMode(),
    signOut: async () => {
      if (isMockMode()) {
        window.location.href = "/login";
      }
    },
  };
}
