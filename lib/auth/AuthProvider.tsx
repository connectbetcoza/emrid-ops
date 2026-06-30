"use client";

import { createContext, useContext, useMemo } from "react";
import type { OpsUser } from "@/types";
import { signOut as signOutAction } from "@/lib/auth/actions";

/**
 * Client auth surface for EMRID Operations. The server resolves the session
 * (`getCurrentOpsUser`) and hands the result down; the client never reads
 * server-only flags or tokens. `mockMode` lets the UI label the session (the
 * "Mock session" pill) without touching server config.
 *
 * `signOut` delegates to the `signOut` server action (revoke refresh token +
 * clear cookies + redirect to /login). The header's account menu uses the same
 * action as a `<form action>` for progressive enhancement; this context method
 * is the programmatic equivalent for any other consumer.
 */
export type OpsAuthContextValue = {
  user: OpsUser | null;
  mockMode: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<OpsAuthContextValue | null>(null);

export function AuthProvider({
  children,
  initialUser,
  mockMode,
}: {
  children: React.ReactNode;
  initialUser: OpsUser | null;
  mockMode: boolean;
}) {
  const value = useMemo<OpsAuthContextValue>(
    () => ({
      user: initialUser,
      mockMode,
      signOut: async () => {
        await signOutAction();
      },
    }),
    [initialUser, mockMode],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): OpsAuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
