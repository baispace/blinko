import {describe,test,expect,beforeAll,afterAll} from 'bun:test';
import {PrismaClient} from '@prisma/client';
import {BLOG_PAGE_SIZE,publicIndex,publicPosts,publicTopic,publicTopics,publicArticle,blogRSS} from '../../server/lib/publicBlog';
import {publishSnapshot} from '../../server/lib/publication';
import {saveBlogTopic,upsertBlogProfile} from '../../server/lib/blog';
import {saveTopicArrangement} from '../../server/lib/blogSections';
import {readFileSync} from 'node:fs';
const homeSrc=readFileSync(new URL('../../app/src/pages/blog/index.tsx',import.meta.url),'utf8');
const homeCss=readFileSync(new URL('../../app/src/components/BlinkoBlog/public/home-refinements.css',import.meta.url),'utf8');
const blogCss=readFileSync(new URL('../../app/src/components/BlinkoBlog/blog.css',import.meta.url),'utf8');
const shellSrc=readFileSync(new URL('../../app/src/components/BlinkoBlog/public/BlogShell.tsx',import.meta.url),'utf8');
const siteSettingsSrc=readFileSync(new URL('../../shared/lib/blogSiteSettings.ts',import.meta.url),'utf8');
const settingsPanelSrc=readFileSync(new URL('../../app/src/components/BlinkoBlog/BlogSiteSettingsPanel.tsx',import.meta.url),'utf8');
const publicBlogSrc=readFileSync(new URL('../../server/lib/publicBlog.ts',import.meta.url),'utf8');
const blogRouterSrc=readFileSync(new URL('../../server/routerTrpc/blog.ts',import.meta.url),'utf8');
const iconsSrc=readFileSync(new URL('../../app/src/components/Common/Iconify/icons.tsx',import.meta.url),'utf8');
/** 图标白名单里有没有这个图标（按 prefix 段落切分，避免撞名）。 */
function hasIcon(prefix:string,name:string){
  const at=iconsSrc.indexOf(`export const ${prefix}: IconCollection`);
  if(at<0)return false;
  const start=iconsSrc.indexOf('{',at);
  const next=iconsSrc.indexOf('\nexport const ',start);
  const block=iconsSrc.slice(start,next<0?iconsSrc.length:next);
  return block.includes(`"${name}":`);
}
// 公开站只认一组 ink-* 变量（--ink-bg/surface/text/muted/line/accent/tint/shadow）。
// 引用了没定义的变量，浏览器会静默退回字面兜底值（多半是亮色），
// 暗色模式下就直接翻车 —— 这里把曾经踩过的三个钉死。
test('公开站的样式只引用已定义的 ink 变量', () => {
  for (const token of ['--ink-panel', '--ink-border', '--ink-soft']) {
    expect(blogCss).not.toContain(`var(${token}`);
    expect(homeCss).not.toContain(`var(${token}`);
  }
  // 暗色下选中的药丸也是「浅紫底 + 紫字」，不能被暗色规则改成实心紫白字
  expect(blogCss).toContain('.ink-blog[data-theme="dark"] .ink-chip[aria-pressed="true"]');
  expect(blogCss).not.toContain('.ink-chip[aria-pressed=true]{background:var(--ink-accent)');
});
// 首页的视图切换是源码级的约定：chip 行上「精选 / 热门 / 全部文章」在前，
// 热门走服务端的热度排序（sort=hot），每个视图顶部都有一句说明，
// 专题视图用作者写的介绍，没写就用「xx主题」。
test('公开首页的视图行：精选 / 热门 / 全部文章，每个视图都有顶部说明', () => {
  expect(homeSrc).toContain('精选');
  expect(homeSrc).toContain('热门');
  expect(homeSrc).toContain('全部文章');
  expect(homeSrc).toContain('sort: "hot"');
  expect(homeSrc).toContain('changeView("hot")');
  expect(homeSrc).toContain('changeView("all")');
  expect(homeSrc).toContain('近期最受关注的文章。');
  expect(homeSrc).toContain('站内全部文章。');
  // 专题没写介绍时的兜底
  expect(homeSrc).toContain('主题');
});
// 首页的筛选控件只允许两级：主导航是大药丸 chip 行（视图 + 专题），
// 次级筛选（排序方式 / 时间窗 / 年份）统一成一套下划线文字 tab。
// 早先这两层各用各的样式，同一屏里出现三种尺寸的控件，看着很乱 ——
// 这里是防它退回去的约定。
test('公开首页的筛选控件统一成两级：药丸主导航 + 下划线次级 tab', () => {
  expect(homeSrc).toContain('ink-sub-tabs');
  // 不再保留各自为政的次级筛选类名
  expect(homeSrc).not.toContain('ink-feed-tabs');
  expect(homeSrc).not.toContain('ink-range-tabs');
  expect(homeSrc).not.toContain('ink-year-tabs');
  expect(homeCss).not.toContain('.ink-range-tabs');
  expect(homeCss).not.toContain('.ink-year-tabs');
  // 次级 tab 只有一套样式
  expect(homeCss.match(/ink-sub-tabs/g)?.length).toBeGreaterThan(0);
  // 版式切换按钮留在列表工具条里：它只影响下方这一片文章，
  // 放远（比如顶到页面最上方的导航行）就离作用对象太远了。
  const headAt = homeSrc.indexOf('ink-section-head');
  const toggleAt = homeSrc.indexOf('ink-view-toggle');
  expect(headAt).toBeGreaterThan(-1);
  expect(toggleAt).toBeGreaterThan(headAt);
  // 三个系统视图各带一个描边图标（精选 / 热门 / 全部文章）。
  // 图标必须真在白名单里 —— tabler:line-chart-line 不在，热门那格曾经是空的。
  // 药丸是单色的：不再有 featured / hot / all 三个色相类名，
  // 图标去圆底后跟文字同色，颜色层级只剩「常态灰 / 选中紫」两档。
  expect(homeSrc).toContain('ink-chip-icon');
  expect(homeSrc).not.toContain('ink-chip-featured');
  expect(homeSrc).not.toContain('ink-chip-hot');
  expect(homeSrc).not.toContain('ink-chip-all');
  expect(blogCss).not.toContain('.ink-chip-featured');
  expect(blogCss).not.toContain('.ink-chip-hot');
  expect(blogCss).not.toContain('.ink-chip-all');
  expect(blogCss).not.toContain('--ink-hue-');
  for (const name of ['star', 'flame', 'files']) {
    expect(hasIcon('tabler', name)).toBe(true);
  }
  expect(homeSrc).not.toContain('tabler:line-chart-line');
});
// 顶栏是这次竞品对标的重点，改动多、又多是「看效果才知道对不对」的地方，
// 所以把几条约定钉成源码级测试，防止以后悄悄退回去：
//   ① 最左侧是收起的「站点与应用」面板；
//   ② 品牌区 hover 变房子图标并回首页；
//   ③ 中间导航：专题 / 友链都是一级直链，「我的」是唯一的二级下拉；
//   ④ 右侧有「随便看看」随机文章按钮（骰子图标）；
//   ⑤ 顶栏常驻吸顶，右上角药丸末尾常驻一个滚动数值。
test('公开顶栏：左侧收束面板 / 品牌回首页 / 专题与友链一级 / 我的二级 / 随机文章 / 滚动收起', () => {
  // ① 左上角：收束菜单 + 品牌卡
  //    ⊞ 收束菜单点开「站点与应用」面板；品牌卡是站点身份，回首页。
  expect(shellSrc).toContain('ink-sites-btn');
  expect(shellSrc).toContain('ink-brand-card');
  expect(shellSrc).toContain('ink-brand-logo');
  // 左上角只留圆形标识，不展示站名文字 —— 名字再摆一遍只是重复。
  // 站点名称本身仍然保留（SEO、页脚署名、分享图都在用）。
  expect(shellSrc).not.toContain('ink-brand-name');
  expect(shellSrc).toContain('ink-sites-panel');
  expect(shellSrc).toContain('aria-label="站点与应用"');
  // 面板内容来自站点真实数据，不是写死的假链接
  expect(shellSrc).toContain('data.profile?.homepage');
  expect(shellSrc).toContain('data.profile?.links');
  expect(shellSrc).toContain('faviconOf');
  // ② 品牌区 hover 换成「返回博客主页」的房子图标
  expect(shellSrc).toContain('ink-brand-home');
  expect(shellSrc).toContain('icon="tabler:home"');
  // 左上角只剩圆形标识，可访问名就落在它身上（不再有站名文字与 title 气泡）。
  expect(shellSrc).toContain('aria-label="返回博客主页"');
  expect(blogCss).toContain('.ink-blog .ink-brand-logo:hover .ink-brand-home');
  // ③ 导航结构是固定的：专题、友链都是一级直链，「我的」是唯一的二级下拉。
  //    原来的「一级 / 多级」开关已退役 —— 专题下面不再挂各专题的子菜单，
  //    读者点专题直接落到专题页，少一次点击。
  expect(shellSrc).toContain('ink-nav-drop');
  expect(shellSrc).toContain('我的');
  expect(shellSrc).toContain('关于我');
  expect(shellSrc).toContain('blogRoute("/blog/friends")');
  expect(shellSrc).not.toContain('data.publicSettings?.navMode');
  expect(shellSrc).not.toContain('data.topics');
  expect(settingsPanelSrc).not.toContain('navMode');
  expect(siteSettingsSrc).not.toContain('navMode');
  // ④ 随机文章：服务端抽，前端只负责跳
  expect(publicBlogSrc).toContain('export async function publicRandomArticle');
  expect(blogRouterSrc).toContain('publicRandomArticle: publicProcedure');
  expect(shellSrc).toContain('api.blog.publicRandomArticle.query()');
  // 随机按钮用等轴测骰子（线框常态 / 实心悬停）
  expect(shellSrc).toContain('sidekickicons:dice');
  expect(shellSrc).toContain('sidekickicons:dice-solid');
  expect(shellSrc).not.toContain('mingcute:shuffle-line');
  // ⑤ 顶栏常驻吸顶：不再有「下滚收起 / 上滑送回」那套。
  //    吸顶失效过一次 —— 原因是 sticky 本身没问题，是下滚时整条被 translateY 挪走了。
  expect(blogCss).toContain('.ink-blog .ink-header{position:sticky');
  expect(shellSrc).not.toContain('data-hidden');
  expect(shellSrc).not.toContain('headerHidden');
  expect(blogCss).not.toContain('[data-hidden="true"]');
  // ⑥ 右上角滚动数值：常驻在操作药丸末尾
  expect(shellSrc).toContain('ink-scroll-meter');
  expect(shellSrc).toContain('function ScrollMeter');
  expect(blogCss).toContain('.ink-scroll-meter');
  // 默认不出现，开始滚动才淡入
  expect(shellSrc).toContain('data-show={shown ? "true" : "false"}');
  expect(shellSrc).toContain('setShown(top > 16)');
  // 必须在顶栏内部（常驻吸顶，不能再靠顶栏收起来露出位置）
  const actionsAt = shellSrc.indexOf('className="ink-actions"');
  const meterAt = shellSrc.indexOf('<ScrollMeter');
  expect(actionsAt).toBeGreaterThan(-1);
  expect(meterAt).toBeGreaterThan(actionsAt);
  // 底色统一纯黑（两套主题同一个符号），暗黑模式只补一道描边
  expect(blogCss).toContain('background: #000');
  expect(blogCss).toContain('.ink-blog[data-theme="dark"] .ink-scroll-meter-badge');
  // 药丸会随数值变胖，导航必须绝对居中，否则会被挤得左右晃
  expect(blogCss).toContain('.ink-blog .ink-desktop-nav{position:absolute;left:50%;transform:translateX(-50%);}');
  // 用到的图标必须在本地白名单里，否则渲染成空白
  for (const [prefix, name] of [
    ['tabler', 'layout-grid'],
    ['tabler', 'home'],
    ['tabler', 'world'],
    ['tabler', 'link'],
    ['tabler', 'chevron-down'],
    ['tabler', 'x'],
    ['sidekickicons', 'dice'],
    ['sidekickicons', 'dice-solid'],
  ] as const) {
    expect(hasIcon(prefix, name)).toBe(true);
  }
});
const suite=process.env.RUN_PUBLISH_DB_TESTS==='1'?describe:describe.skip;suite('public blog pages and feeds',()=>{
 const db=new PrismaClient();let owner=0,other=0;const notes:{id:number;publishId:string}[]=[];let topicId=0;
 beforeAll(async()=>{owner=(await db.accounts.create({data:{name:'public-blog-'+crypto.randomUUID()}})).id;other=(await db.accounts.create({data:{name:'other-blog-'+crypto.randomUUID()}})).id;
  for(let i=0;i<16;i++){const n=await db.notes.create({data:{accountId:owner,content:'# 正文'+i+'\n已公开内容',metadata:{title:'文章 '+i,secret:'PRIVATE_FIELD'}}});const p=await publishSnapshot(db,owner,{id:n.id});notes.push({id:n.id,publishId:p.publishId!});}
  const t=await saveBlogTopic(db,owner,{name:'公开专题',slug:'public-topic',desc:'专题简介',color:'#7055f8',isPublished:true,noteIds:notes.slice(0,6).map(n=>n.id)});topicId=t.id;
  // 章节编排：第一章 3 篇、第二章 2 篇、1 篇未分章节。
  // 全局顺序 = 章节顺序 → 章内顺序 → 未分章节，与原来的扁平顺序一致。
  await saveTopicArrangement(db,owner,{topicId,sections:[{name:'第一章',desc:'开篇',noteIds:notes.slice(0,3).map(n=>n.id)},{name:'第二章',desc:'',noteIds:notes.slice(3,5).map(n=>n.id)}],unassignedNoteIds:[notes[5].id]});
  await saveBlogTopic(db,owner,{name:'空专题',slug:'empty-topic',desc:'',color:'#7055f8',isPublished:true,noteIds:[]});
  await upsertBlogProfile(db,owner,{displayName:'公开作者',tagline:'公开介绍',bio:'公开个人信息',avatarUrl:'',homepage:'https://example.com',links:[],isPublished:true});
  const foreign=await db.notes.create({data:{accountId:other,content:'OTHER_AUTHOR'}});await publishSnapshot(db,other,{id:foreign.id});
 });
 afterAll(async()=>{for(const accountId of [owner,other])if(accountId){await db.notes.deleteMany({where:{accountId}});await db.blogTopic.deleteMany({where:{accountId}});await db.blogProfile.deleteMany({where:{accountId}});await db.accounts.delete({where:{id:accountId}});}await db.$disconnect();});
 test('homepage exposes only explicit profile and bounded snapshot summaries',async()=>{const site=await publicIndex(db,{accountId:owner});expect(site.total).toBe(16);expect(site.posts).toHaveLength(BLOG_PAGE_SIZE);expect(site.nextCursor).toBeTruthy();expect(site.topics).toHaveLength(1);expect(site.profile?.displayName).toBe('公开作者');expect(JSON.stringify(site)).not.toContain('PRIVATE_FIELD');expect(JSON.stringify(site)).not.toContain('OTHER_AUTHOR');});
 test('cursor feed has no duplicates and searches the published version',async()=>{const first=await publicPosts(db,{accountId:owner,limit:7});const second=await publicPosts(db,{accountId:owner,limit:7,cursor:first.nextCursor!});const third=await publicPosts(db,{accountId:owner,limit:7,cursor:second.nextCursor!});const ids=[...first.posts,...second.posts,...third.posts].map(p=>p.id);expect(new Set(ids).size).toBe(16);expect(third.nextCursor).toBeNull();await db.notes.update({where:{id:notes[0].id},data:{content:'SECRET_UNPUBLISHED_DRAFT',metadata:{title:'PRIVATE_TITLE'}}});expect((await publicPosts(db,{accountId:owner,search:'SECRET_UNPUBLISHED_DRAFT'})).total).toBe(0);expect((await publicPosts(db,{accountId:owner,search:'文章 0'})).total).toBe(1);});
 test('topic reading follows authored order with real adjacent and related articles',async()=>{const page=await publicTopic(db,{accountId:owner,slug:'public-topic',limit:3});expect(page?.posts.map(p=>p.id)).toEqual(notes.slice(0,3).map(n=>n.id));expect(page?.nextOffset).toBe(3);const detail=await publicArticle(db,{accountId:owner,publishId:notes[2].publishId});expect(detail?.prev?.id).toBe(notes[1].id);expect(detail?.next?.id).toBe(notes[3].id);expect(detail?.related.map(p=>p.id)).not.toContain(notes[2].id);expect(detail?.related.map(p=>p.id)).not.toContain(notes[1].id);expect(detail?.metadata.title).toBe('文章 2');expect(await publicArticle(db,{accountId:other,publishId:notes[2].publishId})).toBeNull();});
 test('章节目录按章节分组，未分章节单独成块，前后篇跨章衔接',async()=>{
  const topic=await publicTopic(db,{accountId:owner,slug:'public-topic'});
  expect(topic?.sections.map(s=>s.name)).toEqual(['第一章','第二章']);
  expect(topic?.sections[0].posts.map(p=>p.id)).toEqual(notes.slice(0,3).map(n=>n.id));
  expect(topic?.sections[1].posts.map(p=>p.id)).toEqual(notes.slice(3,5).map(n=>n.id));
  expect(topic?.unassigned.posts.map(p=>p.id)).toEqual([notes[5].id]);
  // 章节顺序 → 章内顺序 → 未分章节：全局扁平顺序不变
  expect(topic?.posts.map(p=>p.id)).toEqual(notes.slice(0,6).map(n=>n.id));
  // showTitle=false 的章节不出标题，但文章照常在目录里
  const second=topic!.sections[1];
  await db.blogTopicSection.update({where:{id:second.id},data:{showTitle:false}});
  const hidden=await publicTopic(db,{accountId:owner,slug:'public-topic'});
  expect(hidden?.sections[1].showTitle).toBe(false);
  expect(hidden?.sections[1].posts).toHaveLength(2);
  await db.blogTopicSection.update({where:{id:second.id},data:{showTitle:true}});
  // 前后篇按「章节顺序 + 章内顺序」衔接：第二章第一篇的上一篇是第一章最后一篇
  const detail=await publicArticle(db,{accountId:owner,publishId:notes[3].publishId,topicSlug:'public-topic'});
  expect(detail?.prev?.id).toBe(notes[2].id);
  expect(detail?.next?.id).toBe(notes[4].id);
 });
 test('withdrawal stops topic/detail/recommendation access before pagination',async()=>{await publishSnapshot(db,owner,{id:notes[0].id,isCancel:true});const topic=await publicTopic(db,{accountId:owner,slug:'public-topic',limit:1});expect(topic?.posts[0].id).toBe(notes[1].id);expect((await publicTopics(db,owner))[0].count).toBe(5);expect(await publicArticle(db,{accountId:owner,publishId:notes[0].publishId})).toBeNull();expect(await publicTopic(db,{accountId:owner,slug:'empty-topic'})).toBeNull();await db.blogTopic.update({where:{id:topicId},data:{isPublished:false}});expect(await publicTopic(db,{accountId:owner,slug:'public-topic'})).toBeNull();expect((await publicIndex(db,{accountId:owner})).topics).toHaveLength(0);});
 test('RSS serializes real snapshot links and escapes public text',async()=>{const index=await publicIndex(db,{accountId:owner});const rss=blogRSS(index,'https://example.com');expect(rss).toContain('<rss version="2.0"');expect(rss).toContain('https://example.com/blog/');expect(rss).not.toContain('SECRET_UNPUBLISHED_DRAFT');expect(rss).not.toContain('PRIVATE_FIELD');});
 test('热门排序按阅读数倒序，没有统计行的文章也不丢',async()=>{
  // 给三篇文章不同的阅读数：文章 2 最高、文章 5 次之、文章 9 最低。
  await db.blogPostStat.createMany({data:[
   {noteId:notes[2].id,accountId:owner,views:30,readers:6},
   {noteId:notes[5].id,accountId:owner,views:20,readers:4},
   {noteId:notes[9].id,accountId:owner,views:5,readers:1},
  ]});
  const hot=await publicPosts(db,{accountId:owner,sort:'hot',limit:40});
  const ids=hot.posts.map(p=>p.id);
  // 热度高的排前面
  expect(ids.indexOf(notes[2].id)).toBeLessThan(ids.indexOf(notes[5].id));
  expect(ids.indexOf(notes[5].id)).toBeLessThan(ids.indexOf(notes[9].id));
  // 没有统计行的文章（热度 0）照样在列表里，不能因为内连接被吞掉
  expect(hot.total).toBe(15);
  expect(ids).toHaveLength(15);
  expect(ids).toContain(notes[1].id);
  // 翻页也按热度切
  const page2=await publicPosts(db,{accountId:owner,sort:'hot',limit:5,offset:5});
  expect(page2.posts.map(p=>p.id)).toEqual(ids.slice(5,10));
  // 默认排序不受影响：还是时间序
  const latest=await publicPosts(db,{accountId:owner,limit:40});
  expect(latest.posts.map(p=>p.id)).not.toEqual(ids);
 });
 test('热门榜的时间窗只放窗口内被读过的文章，归档能按年份过滤',async()=>{
  // 窗口内没有任何阅读记录的文章不进榜。
  await db.blogPageView.create({data:{accountId:owner,noteId:notes[1].id,deviceId:'hot-window-device'}});
  const ranged=await publicPosts(db,{accountId:owner,sort:'hot',range:'day',limit:40});
  expect(ranged.posts.map(p=>p.id)).toEqual([notes[1].id]);
  // 卡片上的阅读数就是这段时间的点击数，不是累计值
  expect(ranged.posts[0].views).toBe(1);
  // 不带时间窗时按累计阅读数排，刚才那篇仍是第一
  const allTime=await publicPosts(db,{accountId:owner,sort:'hot',limit:40});
  expect(allTime.posts[0].id).toBe(notes[2].id);
  // 按年过滤：只有当前年份有文章
  const year=new Date().getFullYear();
  expect((await publicPosts(db,{accountId:owner,year,limit:40})).total).toBe(15);
  expect((await publicPosts(db,{accountId:owner,year:1999,limit:40})).total).toBe(0);
 });
});
