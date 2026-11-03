import {test,expect} from 'bun:test';
import {blogDomainRequest} from '../../server/lib/blogDomainRouting';
import {resolveBlogDeployment} from '../../shared/lib/blogDeployment';
const route=(url:string,method='GET',host='blog.baispace.cn',enabled=true)=>blogDomainRequest({host,url,method,enabled,origin:'https://blog.baispace.cn'});
test('domain root and nested public URLs use existing SEO routes with query intact',()=>{
 for(const [url,internal] of [['/','/blog'],['/abc?page=2','/blog/abc?page=2'],['/t/topic?article=abc','/blog/t/topic?article=abc'],['/feed.xml','/blog/feed.xml'],['/sitemap-pages.xml','/blog/sitemap-pages.xml']]) expect(route(url)).toEqual({kind:'rewrite',url:internal});
});
test('workspace domain and existing deployments remain untouched',()=>{
 expect(route('/settings','GET','studio.baispace.cn')).toEqual({kind:'pass'});
 expect(route('/','GET','blog.baispace.cn',false)).toEqual({kind:'pass'});
});
test('old public prefix redirects once with its query',()=>{
 expect(route('/blog')).toEqual({kind:'redirect',url:'https://blog.baispace.cn/'});
 expect(route('/blog/t/a?page=2')).toEqual({kind:'redirect',url:'https://blog.baispace.cn/t/a?page=2'});
});
test('static and root SEO endpoints bypass page rewriting',()=>{
 for(const path of ['/robots.txt','/sitemap.xml','/assets/app.js','/font-assets/main.woff2','/api/file/qr.png']) expect(route(path)).toEqual({kind:'pass'});
});
test('public batched calls and tracking/feedback remain functional',()=>{
 for(const path of ['/api/trpc/blog.publicIndex,blog.publicTopics?batch=1','/api/trpc/blog.trackView','/api/trpc/blog.recommendationEvent','/api/trpc/blog.publicArticleFeedback']) expect(route(path,'POST')).toEqual({kind:'pass'});
});
test('private API, mixed batches, admin routes and encoded bypasses are denied',()=>{
 for(const path of ['/settings','/blog-manage/content/18','/api/auth/session','/api/trpc/blog.publicIndex,blog.saveSiteSettings','/api/file/upload','/api%2ftrpc/blog.publicIndex','/%61pi/auth/session','/sw.js','/.env']) expect(route(path,'POST')).toEqual({kind:'deny'});
 for(const path of ['/settings','/blog-manage','/api/trpc/blog.siteSettings','/.env','/sw.js','/api%2ftrpc/blog.publicIndex']) expect(route(path)).toEqual({kind:'deny'});
});
test('domain mode fixes root mount even when old stored settings say /blog',()=>{
 expect(resolveBlogDeployment({domainRouting:true,targetOrigin:'https://blog.baispace.cn',publicBasePath:'/blog'},{}).publicBasePath).toBe('/');
 expect(resolveBlogDeployment({publicBasePath:'/blog'},{}).publicBasePath).toBe('/blog');
});
