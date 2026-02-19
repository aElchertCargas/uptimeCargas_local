import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare, hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";

async function ensureDefaultUser() {
  const count = await prisma.user.count();
  if (count > 0) return;

  const name = process.env.AUTH_USER_NAME || "admin";
  const email = process.env.AUTH_USER_EMAIL || "admin@uptimecargas.local";
  const passwordHash =
    process.env.AUTH_USER_PASSWORD_HASH ||
    (await hash("changeme", 10));

  await prisma.user.create({
    data: { name, email, passwordHash },
  });
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
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

        await ensureDefaultUser();

        const user = await prisma.user.findUnique({
          where: { email: (credentials.email as string).toLowerCase() },
        });
        if (!user) return null;

        const isValid = await compare(
          credentials.password as string,
          user.passwordHash
        );
        if (!isValid) return null;

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
    maxAge: 30 * 24 * 60 * 60,
  },
});
