import { test, expect } from 'bun:test';
import { publicContentPath, internalContentPath } from '../../shared/lib/blogRoutes';
import { toPublicPath } from '../../shared/lib/blogSeo';
test('explicit content paths preserve identifiers and query context',()=>{
 expect(publicContentPath('/85q7i78w?topic=hello')).toBe('/article/85q7i78w?topic=hello');
 expect(publicContentPath('/t/product-thinking')).toBe('/topic/product-thinking');
 expect(internalContentPath('/article/85q7i78w')).toBe('/85q7i78w');
 expect(toPublicPath('/blog/85q7i78w','/')).toBe('/article/85q7i78w');
 expect(toPublicPath('/blog/t/product-thinking','/')).toBe('/topic/product-thinking');
});
test('system pages and already normalized URLs stay valid',()=>{
 for(const path of ['/subscribe','/moments','/topics','/article/85q7i78w','/topic/product-thinking'])expect(publicContentPath(path)).toBe(path);
});
