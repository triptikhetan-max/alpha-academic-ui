/**
 * NextAuth (Auth.js v5) config — Google SSO gated to Alpha-affiliated domains.
 *
 * Only emails ending in one of `ALLOWED_DOMAINS` are admitted.
 * Set GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + AUTH_SECRET in Vercel env vars.
 */
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

const ALLOWED_DOMAINS = [
  "alpha.school",
  "2hourlearning.com",
  "trilogy.com",
];

function emailIsAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  const lower = email.toLowerCase();
  return ALLOWED_DOMAINS.some((d) => lower.endsWith("@" + d));
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ profile }) {
      // Reject anyone outside the allowed Alpha-affiliated domains.
      return emailIsAllowed(profile?.email);
    },
    async session({ session, token }) {
      // Surface email + a stable user id on the session
      if (session.user && token.sub) {
        (session.user as { id?: string }).id = token.sub;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
});
