import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Default is 1MB; the profile photo upload (src/lib/actions/auth.ts,
    // updateAvatarAction) allows images up to 2MB, so give multipart's
    // boundary/header overhead some room above that.
    serverActions: {
      bodySizeLimit: "3mb",
    },
  },
};

export default nextConfig;
