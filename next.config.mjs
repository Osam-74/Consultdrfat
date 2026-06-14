/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",            // static PWA -> deploys to Cloudflare Pages or GitHub Pages
  images: { unoptimized: true },
  trailingSlash: true,
  // basePath is set for GitHub Pages project repos.
  // Comment this out if deploying to Cloudflare Pages or a custom domain at root.
  // basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
};
export default nextConfig;
