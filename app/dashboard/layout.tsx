/**
 * Dashboard auth gate.
 *
 * - Unauthenticated → /login
 * - Authenticated but email not in DRI_SCOPES → "no access" message
 * - Otherwise renders the dashboard subtree.
 *
 * The actual scope-filtered data fetch happens server-side in
 * `app/api/dashboard-data/route.ts`. This layout only enforces
 * "is this person allowed to see *any* dashboard at all?".
 */
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { scopeForEmail } from "@/lib/dri-scopes";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Alpha Schools Brain — Campus Console",
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.email) {
    redirect("/login");
  }

  const scope = scopeForEmail(session.user.email);
  if (!scope) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "32px",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        <div
          style={{
            maxWidth: 520,
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            padding: "28px 32px",
            background: "#fff",
            boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
          }}
        >
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>
            No dashboard access
          </h1>
          <p style={{ marginTop: 12, lineHeight: 1.5, color: "#374151" }}>
            You signed in as{" "}
            <code
              style={{
                background: "#f3f4f6",
                padding: "1px 6px",
                borderRadius: 4,
              }}
            >
              {session.user.email}
            </code>{" "}
            but your account is not currently provisioned for the Brain
            Dashboard.
          </p>
          <p style={{ marginTop: 12, lineHeight: 1.5, color: "#374151" }}>
            If you think this is a mistake, please reach out to{" "}
            <a
              href="mailto:tripti.khetan@trilogy.com"
              style={{ color: "#2563eb", textDecoration: "underline" }}
            >
              tripti.khetan@trilogy.com
            </a>
            .
          </p>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
