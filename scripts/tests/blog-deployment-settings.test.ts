import {expect,test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {blogDomainRequest} from '../../server/lib/blogDomainRouting';
const source=(p:string)=>readFileSync(join(import.meta.dir,'../..',p),'utf8');
test('all current public blog procedures pass domain gateway, including batch calls',()=>{
 const router=source('server/routerTrpc/blog.ts');
 const names=[...router.matchAll(/^\s+([a-zA-Z]+):\s*publicProcedure/gm)].map(m=>'blog.'+m[1]);
 expect(names.length).toBeGreaterThan(20);
 for(const nameset of [...names,names.join(',')]) expect(blogDomainRequest({enabled:true,origin:'https://blog.example.com',host:'blog.example.com',url:'/api/trpc/'+nameset,method:'POST'})).toEqual({kind:'pass'});
});
test('deployment panel provides one public domain with whole-site proxy example',()=>{
 const panel=source('app/src/components/BlinkoBlog/BlogDeploymentSettings.tsx');
 expect(panel).toContain('公开博客地址');
 expect(panel).toContain('domainRouting:');
 expect(panel).toContain('proxy_pass http://127.0.0.1:1111;');
 expect(panel).not.toContain('proxy_pass http://127.0.0.1:1111/blog');
 expect(panel).toContain('保存域名不等于域名已经部署成功');
});
test('site check resolves current public paths rather than fetching the old mount',()=>{
 const check=source('server/lib/blogSiteCheck.ts');
 expect(check).toContain('toPublicPath');
 expect(check).toContain('publicPath("/blog/feed.xml")');
 expect(check).not.toContain('target + "/blog"');
});
