/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'export',
  basePath: '/fomo',
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
