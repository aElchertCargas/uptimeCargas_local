import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <>
      <Sidebar />
      <main className="ml-56 min-h-screen">
        <div className="mx-auto max-w-7xl px-6 py-6">{children}</div>
      </main>
    </>
  );
}
