"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { authProvider, type Identity } from "./provider";

const IdentityContext = createContext<Identity | null>(null);

export function IdentityProvider({ children }: { children: React.ReactNode }) {
  const [identity, setIdentity] = useState<Identity | null>(null);

  useEffect(() => {
    authProvider
      .getIdentity()
      .then(setIdentity)
      .catch((err) => console.error("[auth] getIdentity failed:", err));
  }, []);

  return (
    <IdentityContext.Provider value={identity}>
      {children}
    </IdentityContext.Provider>
  );
}

export function useIdentity(): Identity | null {
  return useContext(IdentityContext);
}
