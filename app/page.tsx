import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ChatBox } from "@/components/ChatBox";

export default async function HomePage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-stone-200 bg-white/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">🧠</span>
            <h1 className="font-semibold text-ink">Alpha Academic</h1>
            <span className="text-xs text-stone-400 hidden sm:inline">
              · ask anything
            </span>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="/brain"
              className="text-xs text-stone-500 hover:text-ink"
            >
              What's in the brain?
            </a>
            <span className="text-xs text-stone-500 hidden md:inline">
              {session.user.email}
            </span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <button
                type="submit"
                className="text-xs text-stone-500 hover:text-ink"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 max-w-3xl mx-auto w-full px-6 py-8">
        <ChatBox />
      </div>

      {/* Footer */}
      <footer className="border-t border-stone-200 bg-white">
        <div className="max-w-3xl mx-auto px-6 py-4 text-xs text-stone-500 flex flex-wrap gap-4 justify-between">
          <span>
            Backed by 1,759 docs · 47 decisions · 35 people · 14 subjects
          </span>
          <span>
            Built by Tripti · Refreshed weekly from chat + Sheets + Drive folder
          </span>
        </div>
      </footer>
    </main>
  );
}
