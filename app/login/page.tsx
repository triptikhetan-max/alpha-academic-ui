import { signIn } from "@/lib/auth";

export default function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-semibold text-ink mb-2">
            🧠 Alpha Academic
          </h1>
          <p className="text-stone-600">
            Ask anything about Alpha Schools academics — DRIs, policies,
            playbooks, decisions.
          </p>
        </div>

        <div className="bg-white border border-stone-200 rounded-xl p-6 shadow-sm">
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/" });
            }}
          >
            <button
              type="submit"
              className="w-full bg-ink text-white rounded-lg py-3 px-4 font-medium hover:bg-stone-800 transition flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Sign in with Google
            </button>
          </form>

          {searchParams && (
            <ErrorDisplay searchParams={searchParams} />
          )}

          <p className="text-xs text-stone-500 mt-6 leading-relaxed">
            Access restricted to Alpha-affiliated domains: alpha.school,
            2hourlearning.com, trilogy.com, and a few more. If you're on the
            academics team and can't sign in, ping Tripti.
          </p>
        </div>

        <p className="text-center text-xs text-stone-400 mt-8">
          Built by Tripti Khetan. Backed by 1,759 docs · 47 decisions · 35 people.
        </p>
      </div>
    </main>
  );
}

async function ErrorDisplay({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  if (!params.error) return null;
  return (
    <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
      Sign-in failed. Most likely: your email isn't on the allowed domains list.
      If you should have access, ping Tripti.
    </div>
  );
}
