const isProduction = process.env.NODE_ENV === 'production';
const isVercel = process.env.VERCEL === '1';
const withPWA = require('next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
})
module.exports = withPWA({
  output: 'standalone',
  transpilePackages: ['react-diff-view','highlight.js','remark-gfm','rehype-raw'],
  async headers() {
    return [
      {
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
        source: '/icons/(.*).(png|jpe?g|gif|svg|ico|webp)',
      },
      {
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
        source: '/favicon.ico',
      },
      {
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
        source: '/loading.mp4',
      },
      {
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
        source: '/logo-light.png',
      },
      {
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
        source: '/logo-dark.png',
      },
    ];
  },
  webpack: (config, { dev,isServer }) => {
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