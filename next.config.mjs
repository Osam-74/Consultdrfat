/** @type {import('next').NextConfig} */
const isGithubPages = process.env.DEPLOY_TARGET === 'github';
const repoName = 'Consultdrfat';

const nextConfig = {
  // Remove static export for Vercel — enables proper RSC streaming (fixes /index.txt artifact)
  // output: "export" is only used for GitHub Pages deploys
  ...(isGithubPages && { output: "export" }),
  images: { unoptimized: true },
  trailingSlash: true,
  ...(isGithubPages && {
    basePath: `/${repoName}`,
    assetPrefix: `/${repoName}/`,
  }),
};

export default nextConfig;
