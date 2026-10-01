import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,

  // The game files are read from disk at request time, so make sure they are
  // shipped with the /play routes on serverless and standalone builds.
  outputFileTracingIncludes: {
    "/play/**": ["./game/*"],
  },

  async headers() {
    return [
      {
        // The /play routes set their own, stricter headers.
        source: "/((?!play/).*)",
        headers: [
          // other sites may not embed this site in a frame
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
