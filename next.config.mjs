/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",            // static PWA -> deploys to Cloudflare Pages
  images: { unoptimized: true },
  trailingSlash: true,
};
export default nextConfig;
