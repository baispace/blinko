const isProduction = process.env.NODE_ENV === 'production';
const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
})
const isVercel = process.env.VERCEL === '1';
module.exports = withPWA({
  output: 'standalone',
  transpilePackages: ['@mdxeditor/editor', 'react-diff-view','highlight.js','remark-gfm','rehype-raw'],
  webpack: (config, { isServer }) => {
    config.experiments = { ...config.experiments, topLevelAwait: true };
    if (!isServer) {
      config.resolve.fallback = {
        dns: false,
        net:false
      };
    }
    return config;
  },
  outputFileTracing: false,
  reactStrictMode: isProduction? true : false,
  swcMinify: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
})