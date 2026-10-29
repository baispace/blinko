import { prisma } from './prisma';
import { resolveBlogSEO, injectBlogSEO, publicOrigin, sitemapIndex, sitemapPage, blogRobots, publicRSS, type BlogSEO } from './lib/publicBlogSEO';
import { momentsRSS } from './lib/blogMoments';
import { publicBlogOwner } from './lib/blog';
import { readBlogSiteSettings } from './lib/blogSiteSettings';
import { legacyRedirectTarget } from './lib/blogRedirects';
import { setSiteCheckSelfOrigin } from './lib/blogSiteCheck';
import { normalizeBasePath } from '../shared/lib/blogSeo';
const blogSEOByRequest = new WeakMap<object, BlogSEO>();

/**
 * 公开站的运行时配置（基础路径、旧地址跳转规则）。
 *
 * 这些值存在数据库里，但每个请求都查一次太贵 —— 缓存 30 秒足够，
 * 改完配置最多半分钟生效。
 */
type PublicRuntime = {
  loadedAt: number;
  basePath: string;
  legacyEnabled: boolean;
  legacyBasePath: string;
  publicBasePath: string;
  targetOrigin: string;
};
let publicRuntimeCache: PublicRuntime | null = null;
async function publicRuntime(): Promise<PublicRuntime> {
  if (publicRuntimeCache && Date.now() - publicRuntimeCache.loadedAt < 30000)
    return publicRuntimeCache;
  let value: PublicRuntime = {
    loadedAt: Date.now(),
    basePath: '/blog',
    legacyEnabled: false,
    legacyBasePath: '',
    publicBasePath: '/blog',
    targetOrigin: '',
  };
  try {
    const owner = await publicBlogOwner(prisma, undefined);
    if (owner) {
      const stored = await readBlogSiteSettings(prisma, owner);
      if (stored.configured) {
        const data = stored.data;
        value = {
          loadedAt: Date.now(),
          basePath: normalizeBasePath(data.publicBasePath) || '/blog',
          legacyEnabled: !!data.legacyRedirectEnabled,
          legacyBasePath: normalizeBasePath(data.legacyBasePath) || '',
          publicBasePath: normalizeBasePath(data.publicBasePath) || '/blog',
          targetOrigin: data.targetOrigin || '',
        };
      }
    }
  } catch (error) {
    console.error('[public runtime]', error);
  }
  publicRuntimeCache = value;
  return value;
}
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import authRoutes from './routerExpress/auth';
import { configureSession } from './routerExpress/auth/config';

// pg-boss job scheduling
import { getPgBoss, stopPgBoss } from './lib/pgBoss';
import { ArchiveJob } from './jobs/archivejob';
import { DBJob } from './jobs/dbjob';
import { RebuildEmbeddingJob } from './jobs/rebuildEmbeddingJob';
import { RecommandJob } from './jobs/recommandJob';
import { AIScheduledTaskJob } from './jobs/aiScheduledTaskJob';

// tRPC related imports
import { createContext } from './context';
import { appRouter } from './routerTrpc/_app';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { createOpenApiExpressMiddleware } from 'trpc-to-openapi';

// API documentation
import swaggerUi from 'swagger-ui-express';
import { openApiDocument } from './swagger';

// Express router imports
import fileRouter from './routerExpress/file/file';
import uploadRouter from './routerExpress/file/upload';
import deleteRouter from './routerExpress/file/delete';
import s3fileRouter from './routerExpress/file/s3file';
import pluginRouter from './routerExpress/file/plugin';
import rssRouter from './routerExpress/rss';
import openaiRouter from './routerExpress/openai';
import mcpRouter from './routerExpress/mcp';
import { getGlobalConfig } from './routerTrpc/config';
import { buildStaticCdnBase } from '@shared/lib/pathConstant';
import { resolveStaticPublicDir } from './lib/cdnStaticDir';

// Vite integration
import ViteExpress from 'vite-express';

// Process error handling
process.on('uncaughtException', (error) => {
  // Bun 运行时与 axios 1.x 的已知兼容问题：出站请求超时时，AxiosError 构造函数内
  // Error.captureStackTrace 抛 "First argument must be an Error object"（经 follow-redirects
  // 的 socket 事件触发）。服务本身不受影响，仅需记录超时事实，无需整屏错误帧。
  if (error?.message?.includes('First argument must be an Error object')) {
    console.warn(`[axios-timeout] outbound request timed out (bun/axios compat) at ${new Date().toISOString()}`);
    return;
  }
  console.error('uncaughtException:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('unhandledRejection:', reason);
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await stopPgBoss();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  await stopPgBoss();
  process.exit(0);
});

process.on('exit', (code) => {
  console.log(`process exit, code: ${code}`);
});

/**
 * Initialize all scheduled jobs
 * This sets up pg-boss and registers all job workers
 */
async function initializeJobs() {
  try {
    console.log('Initializing pg-boss scheduled jobs...');
    
    // Start pg-boss
    await getPgBoss();
    
    // Initialize all jobs
    // These will restore their schedules from the database if they were running
    await ArchiveJob.initialize();
    await DBJob.initialize();
    await RebuildEmbeddingJob.initialize();
    await RecommandJob.initialize();
    await AIScheduledTaskJob.initialize();
    
    console.log('All scheduled jobs initialized successfully');
  } catch (error) {
    console.error('Failed to initialize scheduled jobs:', error);
    // Don't throw - allow server to start even if jobs fail to initialize
  }
}

// Server configuration
const app = express();
const PORT = 1111;
const appRootDev = path.resolve(__dirname, '../app');
const appRootProd = path.resolve(__dirname, '../server');
let server: any = null;

const transformBlogHTML = (html: string, req: express.Request) => {
  const seo = blogSEOByRequest.get(req);
  return seo ? injectBlogSEO(html, seo) : html;
};

if (process.env.NODE_ENV === 'production') {
  // Vite configuration
  ViteExpress.config({
    mode: 'production',
    transformer: transformBlogHTML,
    inlineViteConfig: {
      //docker production dir /dist not development dir
      root: appRootProd,
      build: { outDir: "public" }
    }
  });
} else {
  process.env.NODE_ENV = 'development';
  ViteExpress.config({
    mode: 'development',
    transformer: transformBlogHTML,
    viteConfigFile: path.resolve(appRootDev, 'vite.config.ts'),
    inlineViteConfig: {
      root: appRootDev,
    }
  });
}

// Global error handler
const errorHandler = (err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('express error:', err);
  res.status(500).json({
    error: {
      message: 'Internal Server Error',
      ...(process.env.NODE_ENV !== 'production' ? { details: err.message, stack: err.stack } : {})
    }
  });
};

/**
 * Setup all API routes for the application
 */
async function setupApiRoutes(app: express.Application) {
  app.use('/api', (req, res, next) => {
    if ((req.path.includes('notes.publicPublished') || req.path.includes('blog.public')) || /^\/v1\/note\/published-(?:list|detail)$/.test(req.path)) {
      res.setHeader('Cache-Control', 'no-store');
    }
    next();
  });
  // Authentication routes
  app.use('/api/auth', authRoutes);

  // tRPC endpoint with adapter for Express
  app.use('/api/trpc',
    createExpressMiddleware({
      router: appRouter,
      createContext: ({ req, res }) => {
        return createContext(req, res);
      },
      onError: ({ error }) => {
        console.error('tRPC error:', error);
      }
    })
  );

  // File handling endpoints
  app.use('/api/file', fileRouter);
  app.use('/api/file/upload', uploadRouter);
  app.use('/api/file/delete', deleteRouter);
  app.use('/api/s3file', s3fileRouter);
  
  app.use('/plugins', pluginRouter);

  // Other API endpoints
  app.use('/api/rss', rssRouter);
  app.use('/v1', openaiRouter);

  // OpenAPI documentation endpoints
  app.get('/api/openapi.json', (req, res) => {
    res.json(openApiDocument);
  });

  // Swagger UI configuration
  app.use('/api-doc', swaggerUi.serve, swaggerUi.setup(openApiDocument, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Blinko API Document',
    customfavIcon: '/favicon.ico',
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'list',
      filter: true
    }
  }));

  // OpenAPI integration
  app.use('/api',
    // @ts-ignore
    createOpenApiExpressMiddleware({
      router: appRouter,
      createContext: ({ req, res }: { req: express.Request; res: express.Response }) => {
        return createContext(req, res);
      }
    })
  );
  
  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });


  app.use('/', mcpRouter);
}

/**
 * Serve pre-compressed (.gz) static assets without re-compressing them.
 *
 * Why: the app ships no compression middleware and vite does not emit
 * pre-compressed bundles. Every first visit therefore pushed ~2.5MB of
 * uncompressed JS while the browser was also firing API calls, which showed
 * up as multi-second "Waiting"/"Stalled" in DevTools on a 2-core box.
 * start.sh generates the matching *.gz files at container start, and this
 * middleware hands them straight to the client — compression cost is zero.
 */
const servePrecompressed = (publicPath: string) => {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      const acceptsGzip = String(req.headers['accept-encoding'] || '').includes('gzip');
      if (!acceptsGzip || req.method !== 'GET') return next();

      const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (!/\.(js|css|html|json|svg|woff2?)(\?|$)/i.test(urlPath)) return next();

      const relPath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '').replace(/^[/\\]+/, '');
      const filePath = path.join(publicPath, relPath);
      const gzPath = `${filePath}.gz`;

      // Path traversal guard: resolved path must stay inside publicPath
      if (!filePath.startsWith(publicPath + path.sep)) return next();

      if (!fs.existsSync(gzPath)) return next();
      const srcStat = fs.statSync(filePath);
      const gzStat = fs.statSync(gzPath);
      // Only serve the .gz when it is not older than the source file
      if (gzStat.mtimeMs < srcStat.mtimeMs) return next();

      // NOTE: the MIME type must stay correct — serving JS/CSS as
      // application/octet-stream makes the browser download instead of execute.
      const ext = path.extname(filePath).toLowerCase();
      const contentType = ext === '.css' ? 'text/css'
        : ext === '.html' ? 'text/html; charset=utf-8'
          : ext === '.json' ? 'application/json; charset=utf-8'
            : ext === '.svg' ? 'image/svg+xml'
              : ext === '.woff' || ext === '.woff2' ? 'font/woff2'
                : ext === '.js' || ext === '.mjs' ? 'text/javascript; charset=utf-8'
                  : 'application/octet-stream';

      res.set({
        'Content-Encoding': 'gzip',
        'Vary': 'Accept-Encoding',
        'Cache-Control': ext === '.html' || /\/(?:sw|registerSW)\.js$/.test(urlPath)
          ? 'no-cache, must-revalidate' : 'public, max-age=604800, immutable',
        'Content-Type': contentType
      });
      fs.createReadStream(gzPath).pipe(res);
      return;
    } catch {
      return next();
    }
  };
};

/**
 * Static-asset CDN rewrite.
 * When `staticCdnEnabled` is on, HTML responses (index.html / `/`) have their
 * same-origin /assets/, /fonts/, /icons/, /locales/ references rewritten to the
 * configured CDN base URL, so the browser fetches JS/CSS/fonts from the CDN
 * instead of the origin. CSS fetched from the CDN then resolves its relative
 * font/image URLs against the CDN domain automatically. This makes the CDN
 * toggle take effect immediately without a rebuild.
 */
function rewriteCdnRefs(html: string, base: string): string {
  // Match a quote / ' / `, 0-2 leading dots, then /(assets|fonts|icons|locales)/
  return html.replace(/(["'(`])\.{0,2}\/(assets|fonts|font-assets|icons|locales)\//g, `$1${base}/$2/`);
}

// Common prefixes that should never be treated as SPA HTML pages.
const CDN_HTML_SKIP_PREFIXES = ['/api/', '/trpc/', '/v1/', '/plugins/', '/dist/', '/uploads/', '/health', '/src/'];
// File extensions that should be served by express.static as real files.
const CDN_STATIC_FILE_EXT = /\.(js|mjs|css|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|eot|otf|pdf|mp4|webm|ogg|mp3|wav|zip|gz)(\?.*)?$/i;

async function readIndexHtmlWithCdnRewrite(fallbackPublicPath: string): Promise<{ html: string; base: string; publicPath: string } | null> {
  const cfg = await getGlobalConfig({ useAdmin: true });
  const enabled = cfg.staticCdnEnabled === true || cfg.staticCdnEnabled === 'true';
  if (!enabled) return null;
  const base = buildStaticCdnBase(cfg.staticCdnBaseUrl, cfg.staticCdnPath);
  if (!base) return null;
  const publicPath = resolveStaticPublicDir() ?? fallbackPublicPath;
  const filePath = path.join(publicPath, 'index.html');
  if (!fs.existsSync(filePath)) return null;
  let html = await fs.promises.readFile(filePath, 'utf-8');
  html = rewriteCdnRefs(html, base);
  return { html, base, publicPath };
}

/**
 * Fast-path rewrite for the root/index.html document.
 * This runs before express.static so the CDN toggle takes effect immediately.
 */
const cdnStaticRewrite = (fallbackPublicPath: string) => {
  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      // Dev mode: never rewrite — let ViteExpress serve the live source build.
      if (process.env.NODE_ENV !== 'production') return next();
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (urlPath !== '/' && urlPath !== '/index.html') return next();

      const result = await readIndexHtmlWithCdnRewrite(fallbackPublicPath);
      if (!result) {
        if (urlPath === '/') {
          const cfg = await getGlobalConfig({ useAdmin: true });
          const enabled = cfg.staticCdnEnabled === true || cfg.staticCdnEnabled === 'true';
          if (!enabled) console.log('[staticCdn] rewrite skipped: staticCdnEnabled is off');
          else console.log(`[staticCdn] rewrite skipped: index.html not found (cwd=${process.cwd()})`);
        }
        return next();
      }
      const replaced = countCdnReplacements(result.html, result.base);
      console.log(`[staticCdn] rewrote ${replaced} asset refs for ${urlPath} -> ${result.base}`);
      res.set({
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, must-revalidate',
      });
      res.send(result.html);
    } catch (err) {
      console.error('[staticCdn] rewrite error', err);
      return next();
    }
  };
};

/**
 * SPA fallback rewrite.
 * In production, express.static cannot serve /notes /settings etc. because those
 * paths have no matching files. This middleware sits AFTER express.static and
 * returns the CDN-rewritten index.html for any HTML page request that fell through.
 * In dev it simply next()s (server/public is absent) so ViteExpress keeps serving.
 */
const cdnSpaFallbackRewrite = (fallbackPublicPath: string) => {
  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      // Dev mode: never rewrite — let ViteExpress serve the live source build.
      if (process.env.NODE_ENV !== 'production') return next();
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      if (res.headersSent) return next();

      const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (CDN_HTML_SKIP_PREFIXES.some(p => urlPath.startsWith(p))) return next();
      if (CDN_STATIC_FILE_EXT.test(urlPath)) return next();
      if (urlPath === '/' || urlPath === '/index.html') return next(); // already handled above

      // Only fall back for browser HTML navigation requests.
      // 公开博客页是例外：链接检查器、抓取器和很多 HTTP 客户端默认发 Accept: */*。
      // 博客页是真实存在的文章地址，应该和浏览器拿到完全一样的 HTML
      // （静态 CDN 开启时尤其重要，否则这些客户端会绕过 CDN 重写拿到
      //  指向源站的资源地址）。
      const accept = String(req.headers.accept || '');
      const isPublicBlogPage = urlPath === '/blog' || urlPath.startsWith('/blog/');
      if (!accept.includes('text/html') && !isPublicBlogPage) return next();

      const result = await readIndexHtmlWithCdnRewrite(fallbackPublicPath);
      if (!result) return next();

      const replaced = countCdnReplacements(result.html, result.base);
      console.log(`[staticCdn] SPA fallback rewrote ${replaced} asset refs for ${urlPath} -> ${result.base}`);
      res.set({
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': blogSEOByRequest.has(req) ? 'no-store' : 'no-cache, must-revalidate',
      });
      const seo = blogSEOByRequest.get(req);
      res.send(seo ? injectBlogSEO(result.html, seo) : result.html);
    } catch (err) {
      return next();
    }
  };
};

/**
 * PWA manifest CDN rewrite.
 * The manifest is a real JSON file, so express.static would serve it as-is.
 * We intercept it and rewrite the icon/shortcut /icons/ and /assets/ references
 * to the CDN so that PWA install prompts also fetch icons from the CDN.
 */
const cdnManifestRewrite = (fallbackPublicPath: string) => {
  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      // Dev mode: never rewrite — let ViteExpress serve the live source build.
      if (process.env.NODE_ENV !== 'production') return next();
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();

      const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (urlPath !== '/manifest.json' && urlPath !== '/manifest.webmanifest') return next();

      const cfg = await getGlobalConfig({ useAdmin: true });
      const enabled = cfg.staticCdnEnabled === true || cfg.staticCdnEnabled === 'true';
      if (!enabled) return next();
      const base = buildStaticCdnBase(cfg.staticCdnBaseUrl, cfg.staticCdnPath);
      if (!base) return next();

      const publicPath = resolveStaticPublicDir() ?? fallbackPublicPath;
      const relPath = urlPath.replace(/^\/+/, '');
      const filePath = path.join(publicPath, relPath);
      if (!filePath.startsWith(publicPath + path.sep) || !fs.existsSync(filePath)) return next();

      let content = await fs.promises.readFile(filePath, 'utf-8');
      content = rewriteCdnRefs(content, base);
      res.set({
        'Content-Type': urlPath.endsWith('.webmanifest')
          ? 'application/manifest+json; charset=utf-8'
          : 'application/json; charset=utf-8',
        'Cache-Control': 'no-cache, must-revalidate',
      });
      res.send(content);
    } catch (err) {
      return next();
    }
  };
};

// Count how many CDN base URLs ended up in the HTML — a cheap sanity signal for
// whether the rewrite actually fired (0 means the references weren't matched).
function countCdnReplacements(html: string, base: string): number {
  if (!base) return 0;
  try {
    const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escaped, 'g');
    const m = html.match(re);
    return m ? m.length : 0;
  } catch {
    return 0;
  }
}

/**
 * Bootstrap the server
 * Sets up middleware, auth, API routes and starts the server
 */
async function bootstrap() {
  try {
    app.use(cors({
      origin: true,
      credentials: true
    }));

    if (process.env.TRUST_PROXY === '1') {
      app.set('trust proxy', 1);
    }

    const staticOptions = {
      maxAge: '7d',
      immutable: true,
      setHeaders: (res: express.Response, path: string) => {
        const ext = path.split('.').pop()?.toLowerCase();
        if (ext === 'html' || /\/(?:sw|registerSW)\.js$/.test(path) || ext === 'webmanifest') {
          res.setHeader('Cache-Control', 'no-cache, must-revalidate');
          return;
        }
        if (['png', 'webp', 'svg', 'json', 'ico', 'gif', 'mp4'].includes(ext || '')) {
          res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
          res.setHeader('Expires', new Date(Date.now() + 604800000).toUTCString());
        }
      }
    };

    // 旧公开地址的永久跳转：只在目标域名和当前域名不同的时候生效。
    // 同域改路径会和服务端自己的路由互相兜底成死循环，这类迁移交给网关处理。
    app.use(async (req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      const runtime = await publicRuntime();
      if (!runtime.legacyEnabled || !runtime.legacyBasePath) return next();
      const target = legacyRedirectTarget(req.path, req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '', {
        enabled: true,
        legacyBasePath: runtime.legacyBasePath,
        publicBasePath: runtime.publicBasePath,
        targetOrigin: runtime.targetOrigin,
        currentHost: req.get('host') || '',
      });
      if (target) return res.redirect(301, target);
      next();
    });

    // These routes precede static/CDN SPA fallbacks so XML and per-page metadata
    // cannot be shadowed by an old static file or a generic cached index.html.
    app.use(async (req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      const pathname = req.path;
      const isBlog = pathname === '/blog' || pathname.startsWith('/blog/');
      const xmlRoute = pathname === '/sitemap.xml' || pathname === '/robots.txt' || pathname === '/blog/feed.xml' || pathname === '/blog/moments/feed.xml' || /^\/blog\/sitemap-(?:pages|articles-\d+)\.xml$/.test(pathname);
      if (!isBlog && !xmlRoute) {
        if ((req.headers.accept || '').includes('text/html') && !pathname.startsWith('/api/')) res.setHeader('X-Robots-Tag','noindex, nofollow');
        return next();
      }
      try {
        const origin = publicOrigin(`${req.protocol}://${req.get('host')}`);
        const runtime = await publicRuntime();
        // 公开域名和工作区同源时，robots 只放行公开博客路径；
        // 公开域名独立时，整站都是公开内容，才按公开基础路径放行。
        const isPublicOrigin = new URL(origin).host === req.get('host');
        const robotsBasePath = isPublicOrigin ? runtime.basePath : '/blog';
        res.setHeader('Cache-Control','no-store');
        if (xmlRoute) {
          if (pathname === '/robots.txt') return res.type('text/plain').send(blogRobots(origin, robotsBasePath));
          const payload = pathname === '/blog/feed.xml' ? await publicRSS(prisma,origin,undefined,runtime.basePath)
            : pathname === '/blog/moments/feed.xml' ? await momentsRSS(prisma,origin,undefined,runtime.basePath)
            : pathname === '/sitemap.xml' ? await sitemapIndex(prisma,origin,undefined,runtime.basePath)
            : await sitemapPage(prisma,origin,pathname === '/blog/sitemap-pages.xml' ? 'pages' : Number(pathname.match(/articles-(\d+)\.xml$/)?.[1]),undefined,runtime.basePath);
          if (!payload) return res.status(404).set('X-Robots-Tag','noindex').type('text/plain').send('Not found');
          return res.type(pathname === '/blog/feed.xml' || pathname === '/blog/moments/feed.xml' ? 'application/rss+xml' : 'application/xml').send(payload);
        }
        if (pathname.endsWith('/')) return res.redirect(301,pathname.replace(/\/+$/,'') + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''));
        // 列表页的分页页码走 ?page=N，canonical / rel=prev,next 靠它
        const page = Number(req.query.page) || 1;
        const seo = await resolveBlogSEO(prisma,pathname,origin,undefined,page);
        if (req.query.feed === 'recommended' || req.query.topic) seo.robots='noindex, follow';
        blogSEOByRequest.set(req,seo);
        res.status(seo.status).set('X-Robots-Tag',seo.robots);
        next();
      } catch (error) {
        console.error('[blog SEO]',error);
        res.status(503).set({'X-Robots-Tag':'noindex','Retry-After':'60'}).type('text/plain').send('公开页面暂时无法加载，请稍后重试。');
      }
    });
    const publicPath = path.resolve(appRootProd, 'public');
    app.use(cdnStaticRewrite(publicPath));
    app.use(cdnManifestRewrite(publicPath));
    app.use(servePrecompressed(publicPath));
    app.use(express.static(publicPath, staticOptions));
    app.use(cdnSpaFallbackRewrite(publicPath));

    // Add body parsers for JSON and form data
    app.use(express.json({ limit: '50mb' }));
    app.use(express.urlencoded({ extended: true, limit: '50mb' }));

    await configureSession(app);

    // Setup API routes
    await setupApiRoutes(app);
    //@ts-ignore
    app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      errorHandler(err, req, res, next);
    });

    // Initialize scheduled jobs
    await initializeJobs();

    // Start or update server
    if (!server) {
      server = app.listen(PORT, "::");
      // 站点检查需要能检查本服务自己（含本机环境）。
      setSiteCheckSelfOrigin(`http://127.0.0.1:${PORT}`);
      
      // Increase timeout for large file uploads (5 minutes)
      server.timeout = 5 * 60 * 1000;
      server.keepAliveTimeout = 5 * 60 * 1000;
      server.headersTimeout = 5 * 60 * 1000;
      
      await ViteExpress.bind(app, server);
      console.log(`🎉frontend and API ready at http://localhost:${PORT} - env: ${process.env.NODE_ENV}`);
    } else {
      console.log(`API routes updated - env: ${process.env.NODE_ENV || 'development'}`);
    }
  } catch (err) {
    console.error('Frontend/API initialization failed; refusing to run a partial server:', err);
    if (server) server.close();
    process.exit(1);
  }
}

// Start the server
bootstrap(); 
