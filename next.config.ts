import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // дубль закрыт (Алёна 21.07.2026): вся работа только на основном кабинете
      {
        source: "/:path*",
        has: [{ type: "host", value: "white-one-erp-staging.vercel.app" }],
        destination: "https://white-one-erp.vercel.app/:path*",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
