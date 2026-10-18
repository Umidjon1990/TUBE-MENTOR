import type { Express, Request } from "express";
import { createHash, randomBytes } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import { createRemoteJWKSet, customFetch, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { users, type User } from "@shared/schema";
import { db } from "./db";
import { hashPassword, requireAuth } from "./auth";
import { finishPlatformLogin, platformOrigin } from './platform-bridge';

type Provider = "google" | "telegram";
type Pending = NonNullable<Request["session"]["socialLogin"]>;
interface Identity {
  subject: string;
  name: string;
  email?: string;
  authoritativeEmail?: boolean;
}
class SocialAuthError extends Error {
  constructor(public reason: string) {
    super(reason);
  }
}
const telegramIssuer = "https://oauth.telegram.org";
const telegramKeys = createRemoteJWKSet(
  new URL(`${telegramIssuer}/.well-known/jwks.json`),
  { timeoutDuration: 10000, [customFetch]: (...args) => fetch(...args) },
);
function config(provider: Provider) {
  const prefix = provider.toUpperCase();
  const clientId = process.env[`${prefix}_CLIENT_ID`]?.trim();
  const clientSecret = process.env[`${prefix}_CLIENT_SECRET`]?.trim();
  const appUrl = process.env.APP_URL?.replace(/\/$/, "");
  if (!clientId || !clientSecret || !appUrl) return null;
  if (provider === "telegram" && !/^\d{1,20}$/.test(clientId)) return null;
  return {
    clientId,
    clientSecret,
    callback: `${appUrl}/api/auth/${provider}/callback`,
  };
}
export const socialProviderEnabled = (provider: Provider) =>
  Boolean(config(provider));
const saveSession = (req: Request) =>
  new Promise<void>((resolve, reject) =>
    req.session.save((error) => (error ? reject(error) : resolve())),
  );
function destination(user: User) {
  return user.role === "admin"
    ? "/admin"
    : user.onboardingCompleted
      ? "/today"
      : "/onboarding";
}
async function begin(req: Request, provider: Provider, linking = false) {
  const settings = config(provider);
  if (!settings) throw new SocialAuthError(`${provider}_unavailable`);
  const pending: Pending = {
    provider,
    state: randomBytes(32).toString("base64url"),
    nonce: randomBytes(32).toString("base64url"),
    verifier: randomBytes(48).toString("base64url"),
    expires: Date.now() + 600000,
    ...(!linking && req.session.platformLogin && req.session.platformLogin.expires > Date.now() ? { platformNonce: req.session.platformLogin.nonce } : {}),
    ...(linking
      ? {
          linkUserId: req.session.userId,
          authVersion: req.session.authVersion,
        }
      : {}),
  };
  req.session.socialLogin = pending;
  delete req.session.platformLogin;
  await saveSession(req);
  const challenge = createHash("sha256")
    .update(pending.verifier)
    .digest("base64url");
  if (provider === "google") {
    return new OAuth2Client(
      settings.clientId,
      settings.clientSecret,
      settings.callback,
    ).generateAuthUrl({
      scope: ["openid", "email", "profile"],
      state: pending.state,
      nonce: pending.nonce,
      code_challenge: challenge,
      code_challenge_method: "S256" as any,
      ...(linking ? { prompt: "select_account" } : {}),
    });
  }
  const url = new URL(`${telegramIssuer}/auth`);
  url.search = new URLSearchParams({
    client_id: settings.clientId,
    redirect_uri: settings.callback,
    response_type: "code",
    scope: "openid profile",
    state: pending.state,
    nonce: pending.nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}
async function identity(
  provider: Provider,
  code: string,
  pending: Pending,
): Promise<Identity> {
  const settings = config(provider);
  if (!settings) throw new SocialAuthError(`${provider}_unavailable`);
  if (provider === "google") {
    const client = new OAuth2Client(
      settings.clientId,
      settings.clientSecret,
      settings.callback,
    );
    const { tokens } = await client.getToken({
      code,
      codeVerifier: pending.verifier,
    });
    if (!tokens.id_token) throw new Error("Missing Google ID token");
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: settings.clientId,
    });
    const payload = ticket.getPayload();
    if (
      !payload?.sub ||
      !payload.email ||
      !payload.email_verified ||
      (payload as unknown as Record<string, unknown>).nonce !== pending.nonce
    )
      throw new Error("Invalid Google identity");
    const email = payload.email.toLowerCase();
    return {
      subject: payload.sub,
      name: payload.name?.trim().slice(0, 100) || "O‘quvchi",
      email,
      authoritativeEmail: email.endsWith("@gmail.com") || Boolean(payload.hd),
    };
  }
  const response = await fetch(`${telegramIssuer}/token`, {
    method: "POST",
    signal: AbortSignal.timeout(15000),
    headers: {
      Authorization: `Basic ${Buffer.from(`${settings.clientId}:${settings.clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: settings.callback,
      client_id: settings.clientId,
      code_verifier: pending.verifier,
    }),
  });
  if (!response.ok) throw new Error("Telegram token exchange failed");
  const tokens = await response.json();
  if (typeof tokens.id_token !== "string" || tokens.id_token.length > 16384)
    throw new Error("Missing Telegram ID token");
  const { payload } = await jwtVerify(tokens.id_token, telegramKeys, {
    issuer: telegramIssuer,
    audience: settings.clientId,
    algorithms: ["RS256"],
    requiredClaims: ["sub", "iat", "exp", "nonce"],
    maxTokenAge: "10m",
    clockTolerance: 5,
  });
  if (
    payload.nonce !== pending.nonce ||
    !payload.sub ||
    payload.sub.length > 255
  )
    throw new Error("Invalid Telegram identity");
  return {
    subject: payload.sub,
    name:
      typeof payload.name === "string"
        ? payload.name.trim().slice(0, 100) || "O‘quvchi"
        : "O‘quvchi",
  };
}
async function resolveUser(
  provider: Provider,
  claims: Identity,
  pending: Pending,
  req: Request,
) {
  const column = provider === "google" ? users.googleId : users.telegramId;
  const field = provider === "google" ? "googleId" : "telegramId";
  return db.transaction(async (tx) => {
    if (pending.linkUserId) {
      // Linking requires the same authenticated account and session generation at both ends.
      if (
        req.session.userId !== pending.linkUserId ||
        req.session.authVersion !== pending.authVersion
      )
        throw new SocialAuthError("link_session_expired");
      const [target] = await tx
        .select()
        .from(users)
        .where(eq(users.id, pending.linkUserId))
        .for("update");
      if (
        !target ||
        !target.isActive ||
        target.sessionVersion !== pending.authVersion
      )
        throw new SocialAuthError("link_session_expired");
      if (target[field] && target[field] !== claims.subject)
        throw new SocialAuthError("provider_already_linked");
      const [owner] = await tx
        .select()
        .from(users)
        .where(eq(column, claims.subject));
      if (owner && owner.id !== target.id)
        throw new SocialAuthError("account_in_use");
      const changes: Partial<typeof users.$inferInsert> = {
        [field]: claims.subject,
        updatedAt: new Date(),
      };
      if (claims.email) {
        const [emailOwner] = await tx
          .select()
          .from(users)
          .where(eq(users.email, claims.email));
        if (emailOwner && emailOwner.id !== target.id)
          throw new SocialAuthError("account_in_use");
        if (!target.email || target.email === claims.email) {
          changes.email = claims.email;
          changes.emailVerified = true;
        }
      }
      const [linked] = await tx
        .update(users)
        .set(changes)
        .where(eq(users.id, target.id))
        .returning();
      return linked;
    }
    let [user] = await tx
      .select()
      .from(users)
      .where(eq(column, claims.subject))
      .for("update");
    if (!user && claims.email) {
      const [existing] = await tx
        .select()
        .from(users)
        .where(eq(users.email, claims.email))
        .for("update");
      if (existing) {
        if (
          !claims.authoritativeEmail ||
          existing.role !== "student" ||
          (existing.googleId && existing.googleId !== claims.subject)
        )
          throw new SocialAuthError("google_email_link");
        if (!existing.isActive) throw new SocialAuthError("blocked");
        [user] = await tx
          .update(users)
          .set({ googleId: claims.subject, emailVerified: true })
          .where(eq(users.id, existing.id))
          .returning();
      }
    }
    if (!user) {
      if (process.env.ALLOW_SIGNUP === "false")
        throw new SocialAuthError("signup_disabled");
      [user] = await tx
        .insert(users)
        .values({
          [field]: claims.subject,
          email: claims.email || null,
          emailVerified: Boolean(claims.email),
          username: `${provider}_${randomBytes(12).toString("hex")}`,
          fullName: claims.name,
          passwordHash: hashPassword(randomBytes(48).toString("hex")),
          role: "student",
        })
        .onConflictDoNothing({ target: column })
        .returning();
      if (!user)
        [user] = await tx
          .select()
          .from(users)
          .where(eq(column, claims.subject));
    }
    if (!user || !user.isActive) throw new SocialAuthError("blocked");
    const [updated] = await tx
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, user.id))
      .returning();
    return updated;
  });
}
export function registerSocialAuthRoutes(
  app: Express,
  establishSession: (req: Request, user: User) => Promise<void>,
) {
  for (const provider of ["google", "telegram"] as const) {
    app.get(`/api/auth/${provider}`, async (req, res) => {
      try {
        res.redirect(await begin(req, provider));
      } catch {
        res.redirect(`/login?error=${provider}_unavailable`);
      }
    });
    app.post(
      `/api/auth/accounts/${provider}/link`,
      requireAuth,
      async (req, res) => {
        if (!socialProviderEnabled(provider))
          return res.status(503).json({
            message: `${provider === "telegram" ? "Telegram" : "Google"} orqali kirish hali sozlanmagan`,
          });
        res.json({ url: await begin(req, provider, true) });
      },
    );
    app.get(`/api/auth/${provider}/callback`, async (req, res) => {
      const pending = req.session.socialLogin;
      delete req.session.socialLogin;
      await saveSession(req); // Consume the flow before token exchange, even on failures.
      const failure = pending?.linkUserId
        ? "/profile?link_error="
        : "/login?error=";
      if (
        !pending ||
        pending.provider !== provider ||
        pending.expires < Date.now() ||
        typeof req.query.state !== "string" ||
        req.query.state !== pending.state ||
        typeof req.query.code !== "string" ||
        req.query.code.length > 4096
      )
        return res.redirect(`${failure}${provider}_failed`);
      try {
        const claims = await identity(provider, req.query.code, pending);
        const user = await resolveUser(provider, claims, pending, req);
        if (pending.linkUserId)
          return res.redirect(`/profile?linked=${provider}`);
        await establishSession(req, user);
        if (pending.platformNonce) {
          const target = await finishPlatformLogin(user, pending.platformNonce);
          if (target) return res.redirect(target);
        }
        res.redirect(destination(user));
      } catch (error) {
        const reason =
          error instanceof SocialAuthError
            ? error.reason
            : (error as { code?: string }).code === "23505"
              ? "account_in_use"
              : `${provider}_failed`;
        res.redirect(pending.platformNonce && platformOrigin() ? platformOrigin() + '/kirish?error=' + encodeURIComponent(reason) : `${failure}${reason}`);
      }
    });
  }
}
