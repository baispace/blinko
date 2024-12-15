const isProduction = process.env.NODE_ENV === 'production';
const isVercel = process.env.VERCEL === '1';
const withPWA = require('next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
})
module.exports = withPWA({
  output: 'standalone',
  transpilePackages: ['react-diff-view','highlight.js','remark-gfm','rehype-raw'],
  webpack: (config, { isServer }) => {
    config.experiments = { ...config.experiments, topLevelAwait: true };
    if (!isServer) {
      config.resolve.fallback = {
        dns: false,
        net: false,
        fs: false,
        path: false,
      };
    }
    return config;
  },
  outputFileTracing: isVercel? false : true,
  reactStrictMode: isProduction? true : false,
  swcMinify: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
})