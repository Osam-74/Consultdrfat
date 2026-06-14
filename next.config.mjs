/** @type {import('next').NextConfig} */
const nextConfig = {
  // NOTE: output: "export" is removed — Cloudflare Pages uses OpenNext/Workers
  // which handles its own build. If you need GitHub Pages static export instead,
  // add back: output: "export"
  images: { unoptimized: true },
  trailingSlash: true,
};
export default nextConfig;
