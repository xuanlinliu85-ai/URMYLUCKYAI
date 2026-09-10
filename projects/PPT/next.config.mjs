import path from "node:path";
import { realpathSync } from "node:fs";

const dependencyRoot = path.dirname(realpathSync("node_modules"));

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: { root: dependencyRoot },
  experimental: {
    serverActions: { bodySizeLimit: "50mb" }
  },
  serverExternalPackages: ["sharp"]
};

export default nextConfig;
