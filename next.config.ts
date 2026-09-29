import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // The calendar is the start page.
      { source: "/", destination: "/kalendarz", permanent: false },
      // The form moved so its address no longer looks like a recipe's.
      { source: "/przepisy/nowy", destination: "/nowy-przepis", permanent: false },
    ];
  },
};

export default nextConfig;
