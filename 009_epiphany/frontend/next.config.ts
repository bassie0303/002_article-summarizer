import type { NextConfig } from "next";

// /api/* をバックエンド(FastAPI)にプロキシする。
// ブラウザからは同一オリジン(:3000)に見えるので CORS を気にしなくてよい。
const config: NextConfig = {
  async rewrites() {
    const backend = process.env.BACKEND_URL ?? "http://localhost:8000";
    return [
      { source: "/api/:path*", destination: `${backend}/api/:path*` },
    ];
  },
};

export default config;
