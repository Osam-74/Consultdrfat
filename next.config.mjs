/** @type {import('next').NextConfig} */
const nextConfig = {
  // output: "export" — static HTML/CSS/JS to out/ folder
  // Works with: Cloudflare Pages (Next.js preset, output dir: out)
  // Works with: Vercel (auto-detected, no changes needed)
  // Works with: GitHub Pages (output dir: out)
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
};
export default nextConfig;
