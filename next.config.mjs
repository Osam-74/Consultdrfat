/** @type {import('next').NextConfig} */
const isGithubPages = process.env.DEPLOY_TARGET === 'github';
const repoName = 'Consultdrfat'; // must match your GitHub repo name exactly

const nextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
  // basePath only for GitHub Pages — Cloudflare & Vercel deploy to root
  ...(isGithubPages && {
    basePath: `/${repoName}`,
    assetPrefix: `/${repoName}/`,
  }),
};

export default nextConfig;
