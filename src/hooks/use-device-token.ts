"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "clipper-studio-device-token";

function createBrowserToken() {
  if (crypto.randomUUID) {
    return `anon_${crypto.randomUUID()}`;
  }

  return `anon_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function useDeviceToken() {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const existing = localStorage.getItem(STORAGE_KEY);

    if (existing) {
      setToken(existing);
      return;
    }

    const nextToken = createBrowserToken();
    localStorage.setItem(STORAGE_KEY, nextToken);
    setToken(nextToken);
  }, []);

  return token;
}
