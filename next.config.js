const isProduction = process.env.NODE_ENV === 'production';
const withPWA = require('next-pwa')({
  dest: 'public',
  maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, 
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development', 
  fallbacks: {
    document: '/offline' 
  },
  cacheOnFrontEndNav: true,
  reloadOnOnline: true,
  runtimeCaching: [
    {
      urlPattern: ({ url }) => {
        const isSameOrigin = self.origin === url.origin;
        return isSameOrigin;
      },
      handler: 'NetworkFirst',
      options: {
        cacheName: 'pages-cache',
        networkTimeoutSeconds: 10,
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 24 * 60 * 60
        }
      }
    },
    {
      urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
      handler: 'NetworkFirst',
      options: {
        cacheName: 'api-cache',
        networkTimeoutSeconds: 10,
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 24 * 60 * 60
        }
      }
    },
    {
      urlPattern: ({ request }) => 
        request.destination === 'style' ||
        request.destination === 'script' ||
        request.destination === 'font' ||
        request.destination === 'image',
      handler: 'CacheFirst',
      options: {
        cacheName: 'static-assets',
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 24 * 60 * 60 * 30
        }
      }
    }
  ]
})

const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true'
})

module.exports = withBundleAnalyzer(withPWA({
  output: 'standalone',
  transpilePackages: ['react-diff-view','highlight.js','remark-gfm','rehype-raw'],
  pageExtensions: ['tsx', 'ts', 'jsx', 'js'],
  serverExternalPackages: ["@mastra/*", "onnxruntime-node", "@libsql/client"],
  async headers() {
    return [
      {
        source: '/api/openapi.json',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: '*'
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, OPTIONS'
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization'
          }
        ]
      },
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
        source: '/dist/js/lute/lute.min.js',
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
      }
    ];
  },
  webpack: (config, { dev, isServer }) => {
    config.experiments = { ...config.experiments, topLevelAwait: true };
    
    if (!isServer) {
      config.resolve.fallback = {
        dns: false,
        net: false,
        fs: false,
        path: false,
        process: false,
        'onnxruntime-node': false,
      };
    }
    
    config.module = {
      ...config.module,
      exprContextCritical: false,
      noParse: [/onnxruntime-node/],
    };
    
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false,
    };
    
    config.module.rules.push({
      test: /\.(glsl|vs|fs|vert|frag)$/,
      exclude: /node_modules/,
      use: ['raw-loader', 'glslify-loader'],
    })
    return config;
  },
  reactStrictMode: isProduction? true : false,
  eslint: {
    ignoreDuringBuilds: true,
  },
  async rewrites() {
    return [
      {
        source: '/plugins/:path*',
        destination: '/api/serve-plugin/:path*',
      },
      {
        source: '/v1/chat/completions',
        destination: '/api/completions',
      }
    ]
  }
  
}))