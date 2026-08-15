export const runtime = "nodejs"
import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcrypt";
import { recordAuthEvent, AUDIT_ACTION, ENTITY } from "@/lib/audit";

// Simple in-memory rate limiter for auth attempts
const authAttempts = new Map<string, { count: number; lockedUntil: number }>();

function checkAuthRateLimit(identifier: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const record = authAttempts.get(identifier);
  
  // Clean up expired entries periodically
  if (Math.random() < 0.01) { // 1% chance to clean up
    for (const [key, value] of authAttempts.entries()) {
      if (now > value.lockedUntil && value.count === 0) {
        authAttempts.delete(key);
      }
    }
  }
  
  if (!record || now > record.lockedUntil) {
    authAttempts.set(identifier, { count: 1, lockedUntil: now + 15 * 60 * 1000 }); // 15 min window
    return { allowed: true, remaining: 4 }; // 5 attempts per 15 min
  }
  
  if (record.count >= 5) {
    return { allowed: false, remaining: 0 };
  }
  
  record.count++;
  return { allowed: true, remaining: 5 - record.count };
}

function recordFailedAttempt(identifier: string) {
  const now = Date.now();
  const record = authAttempts.get(identifier);
  if (record) {
    record.count++;
    // Lock for 30 minutes after 5 failures
    if (record.count >= 5) {
      record.lockedUntil = now + 30 * 60 * 1000;
    }
  }
}

function clearAuthAttempts(identifier: string) {
  authAttempts.delete(identifier);
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "text", placeholder: "admin@vitalcore.local" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          await recordAuthEvent({
            userId: null,
            action: AUDIT_ACTION.LOGIN_FAIL,
            entityType: ENTITY.SESSION,
            entityId: "anonymous",
            changes: { email: credentials?.email, reason: "missing_credentials" },
          });
          throw new Error("Invalid credentials");
        }

        // Rate limiting check
        const rateLimit = checkAuthRateLimit(credentials.email);
        if (!rateLimit.allowed) {
          await recordAuthEvent({
            userId: null,
            action: AUDIT_ACTION.LOGIN_FAIL,
            entityType: ENTITY.SESSION,
            entityId: "anonymous",
            changes: { email: credentials.email, reason: "rate_limited" },
          });
          throw new Error("Too many login attempts. Please try again later.");
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          include: { role: true },
        });

        if (!user || !user.hashedPassword || !user.isActive) {
          recordFailedAttempt(credentials.email);
          await recordAuthEvent({
            userId: user?.id ?? null,
            action: AUDIT_ACTION.LOGIN_FAIL,
            entityType: ENTITY.SESSION,
            entityId: user?.id ?? "anonymous",
            changes: {
              email: credentials.email,
              reason: !user ? "user_not_found" : !user.isActive ? "inactive" : "no_password",
            },
          });
          throw new Error("Invalid credentials");
        }

        const isPasswordValid = await bcrypt.compare(
          credentials.password,
          user.hashedPassword!
        );

        if (!isPasswordValid) {
          recordFailedAttempt(credentials.email);
          await recordAuthEvent({
            userId: user.id,
            action: AUDIT_ACTION.LOGIN_FAIL,
            entityType: ENTITY.SESSION,
            entityId: user.id,
            changes: { email: credentials.email, reason: "bad_password" },
          });
          throw new Error("Invalid credentials");
        }

        // Clear failed attempts on successful login
        clearAuthAttempts(credentials.email);

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role?.name || "USER",
        };
      }
    })
  ],
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // 8 hours
    updateAge: 60 * 60, // 1 hour
  },
  jwt: {
    maxAge: 8 * 60 * 60,
  },
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
      }
      // Handle session updates (e.g., role change)
      if (trigger === "update" && session) {
        token.role = session.user?.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login", // Redirect errors to login page
  },
  // Security headers
  trustHost: true, // Prevent host header injection
  // Enable debug in development
  debug: process.env.NODE_ENV === "development",

  // Events for logging
  events: {
    async signIn({ user, isNewUser, account }) {
      console.log(`[AUTH] User signed in: ${user.email} (new: ${isNewUser})`);
      // Account may be undefined in some flows; guard accordingly.
      const userId = (user as { id?: string })?.id ?? null;
      await recordAuthEvent({
        userId,
        action: AUDIT_ACTION.LOGIN_SUCCESS,
        entityType: ENTITY.SESSION,
        // Entity id is the userId (sessions are ephemeral; the user
        // is the stable anchor). Fall back to "anonymous" sentinel
        // if no user id is available (e.g. OAuth with no profile).
        entityId: userId ?? "anonymous",
        changes: {
          provider: account?.provider,
          isNewUser: !!isNewUser,
        },
      });
    },
    async signOut({ session, token }) {
      const email = session?.user?.email ?? token?.email;
      const userId = (session?.user as { id?: string } | undefined)?.id
        ?? (token as { sub?: string } | undefined)?.sub
        ?? null;
      console.log(`[AUTH] User signed out: ${email}`);
      await recordAuthEvent({
        userId,
        action: AUDIT_ACTION.LOGOUT,
        entityType: ENTITY.SESSION,
        entityId: userId ?? "anonymous",
      });
    },
  },
};
