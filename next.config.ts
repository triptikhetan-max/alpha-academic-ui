import type { NextConfig } from "next";

/**
 * NOTE (2026-04-30): The Campus DRI Operational Dashboard was split out of
 * this project into its own Vercel app at https://alpha-campus-dashboard.vercel.app.
 * Any /dashboard/* request that still hits this project (the Brain ask-anything
 * surface) is permanently redirected to the new project so old bookmarks,
 * inbound emails, and DRI links keep working.
 */
const DASHBOARD_NEW_ORIGIN = "https://alpha-campus-dashboard.vercel.app";

const config: NextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      {
        source: "/dashboard",
        destination: `${DASHBOARD_NEW_ORIGIN}/dashboard`,
        permanent: true,
      },
      {
        source: "/dashboard/:path*",
        destination: `${DASHBOARD_NEW_ORIGIN}/dashboard/:path*`,
        permanent: true,
      },
    ];
  },
};

export default config;
