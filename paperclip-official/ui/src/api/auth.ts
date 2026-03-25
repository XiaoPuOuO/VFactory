export type AuthSession = {
  session: { id: string; userId: string };
  user: { id: string; email: string | null; name: string | null };
};

export type AuthSessionResult =
  | AuthSession
  | null
  | { banned: true; reason: string; bannedUntil: string | null };

export function isAuthSession(
  v: AuthSessionResult | undefined,
): v is AuthSession {
  return v != null && typeof v === "object" && "session" in v && "user" in v;
}

export type AuthProviders = {
  emailPassword: boolean;
  google: boolean;
};

function toSession(value: unknown): AuthSession | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const sessionValue = record.session;
  const userValue = record.user;
  if (!sessionValue || typeof sessionValue !== "object") return null;
  if (!userValue || typeof userValue !== "object") return null;
  const session = sessionValue as Record<string, unknown>;
  const user = userValue as Record<string, unknown>;
  if (typeof session.id !== "string" || typeof session.userId !== "string") return null;
  if (typeof user.id !== "string") return null;
  return {
    session: { id: session.id, userId: session.userId },
    user: {
      id: user.id,
      email: typeof user.email === "string" ? user.email : null,
      name: typeof user.name === "string" ? user.name : null,
    },
  };
}

async function authPost(path: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/auth${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (payload as { error?: { message?: string } | string } | null)?.error &&
      typeof (payload as { error?: { message?: string } | string }).error === "object"
        ? ((payload as { error?: { message?: string } }).error?.message ?? `Request failed: ${res.status}`)
        : (payload as { error?: string } | null)?.error ?? `Request failed: ${res.status}`;
    throw new Error(message);
  }
  return payload;
}

export const authApi = {
  getProviders: async (): Promise<AuthProviders> => {
    const res = await fetch("/api/auth/providers", { credentials: "include" });
    if (!res.ok) return { emailPassword: true, google: false };
    const data = await res.json().catch(() => ({}));
    return {
      emailPassword: data.emailPassword !== false,
      google: data.google === true,
    };
  },

  /** 導向 Better Auth 的 Google OAuth 流程；callbackURL 為登入成功後要導向的完整 URL */
  signInWithGoogle: async (callbackURL?: string) => {
    const base = typeof window !== "undefined" ? window.location.origin : "";
    const target = callbackURL ?? `${base}/`;
    const res = await fetch("/api/auth/sign-in/social", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "google", callbackURL: target }),
    });
    const payload = (await res.json().catch(() => null)) as
      | { url?: string; error?: { message?: string } | string }
      | null;
    if (!res.ok) {
      const errorValue = payload?.error;
      const message =
        typeof errorValue === "string"
          ? errorValue
          : errorValue && typeof errorValue === "object"
            ? (errorValue.message ?? `Request failed: ${res.status}`)
            : `Request failed: ${res.status}`;
      throw new Error(message);
    }
    const redirectUrl =
      (payload && typeof payload.url === "string" ? payload.url : null) ??
      res.headers.get("location");
    if (!redirectUrl) {
      throw new Error("Auth redirect URL missing");
    }
    if (typeof window !== "undefined") window.location.href = redirectUrl;
  },

  /** 封禁時回傳 { banned: true, reason, bannedUntil }，未登入 401 回傳 null，成功回傳 session */
  getSession: async (): Promise<AuthSessionResult> => {
    const res = await fetch("/api/auth/get-session", {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    const payload = await res.json().catch(() => null);
    if (res.status === 401) return null;
    if (res.status === 403 && payload && typeof payload === "object") {
      const p = payload as { error?: string; reason?: string; bannedUntil?: string | null };
      if (p.error === "Account banned" && (p.reason != null || p.bannedUntil != null)) {
        return {
          banned: true,
          reason: typeof p.reason === "string" ? p.reason : "Your account has been suspended.",
          bannedUntil: typeof p.bannedUntil === "string" || p.bannedUntil === null ? p.bannedUntil : null,
        };
      }
    }
    if (!res.ok) {
      throw new Error(`Failed to load session (${res.status})`);
    }
    const direct = toSession(payload);
    if (direct) return direct;
    const nested = payload && typeof payload === "object" ? toSession((payload as Record<string, unknown>).data) : null;
    return nested;
  },

  signInEmail: async (input: { email: string; password: string }) => {
    await authPost("/sign-in/email", input);
  },

  signUpEmail: async (input: { name: string; email: string; password: string }) => {
    await authPost("/sign-up/email", input);
  },

  signOut: async () => {
    await authPost("/sign-out", {});
  },
};
