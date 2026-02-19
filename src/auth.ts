import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";

// Define your users here or load from database
// Passwords should be hashed with: bcryptjs.hash(password, 10)
const users = [
  {
    id: "1",
    name: process.env.AUTH_USER_NAME || "admin",
    email: process.env.AUTH_USER_EMAIL || "admin@uptimecargas.local",
    // Default password is "changeme" - CHANGE THIS in production via AUTH_USER_PASSWORD_HASH
    passwordHash: process.env.AUTH_USER_PASSWORD_HASH || "$2a$10$8K1p/a0dL3LKkTFJCzo8Leu9NQGr.Y4v6hzYqm9hYKX7fPXgq0Hvu",
  },
];

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true, // Trust Railway and other deployment platforms
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email", placeholder: "admin@uptimecargas.local" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = users.find((u) => u.email === credentials.email);
        if (!user) {
          return null;
        }

        const isValid = await compare(
          credentials.password as string,
          user.passwordHash
        );

        if (!isValid) {
          return null;
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
        };
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
});
