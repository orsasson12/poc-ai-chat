import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { hasSentry } from "./lib/env";

const nextConfig: NextConfig = {
  /* config options here */
};

const config: NextConfig = hasSentry()
  ? withSentryConfig(nextConfig, {
      silent: true,
      disableLogger: true,
      sourcemaps: { disable: true },
    })
  : nextConfig;

export default config;
