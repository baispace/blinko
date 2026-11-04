import { describe,test,expect } from "bun:test";
import { articlesBelowBanner } from "../../shared/lib/blogFeedLayout";
import { managerBlogVisitUrl,withoutStatisticsPreference } from "../../shared/lib/blogManagerVisit";
import { recommendationReasons } from "../../shared/lib/blogRecommendationReason";
import { blogWorkQueue } from "../../server/lib/blogWorkQueue";

describe("article discovery",()=>{
  const rows=Array.from({length:8},(_,id)=>({id}));
  test("all-banner and sparse lists retain readable articles",()=>{
    expect(articlesBelowBanner(rows.slice(0,2),rows.slice(0,2))).toHaveLength(2);
    expect(articlesBelowBanner(rows.slice(0,5),rows.slice(0,3))).toHaveLength(5);
    expect(articlesBelowBanner([],rows)).toEqual([]);
  });
  test("ample candidates remove all displayed banners without losing order",()=>{
    expect(articlesBelowBanner(rows,rows.slice(0,3)).map(p=>p.id)).toEqual([3,4,5,6,7]);
  });
});
describe("independent-domain manager visit",()=>{
  test("preserves path, query and anchor and never carries credentials",()=>{
    const url=managerBlogVisitUrl("https://blog.baispace.cn/article?page=2#section");
    expect(url).toBe("https://blog.baispace.cn/article?page=2&statistics=off#section");
    expect(withoutStatisticsPreference(url)).toBe("/article?page=2#section");
    expect(managerBlogVisitUrl("/blog")).toBe("/blog?statistics=off");
  });
  test("only an explicit off preference is consumed",()=>{
    expect(withoutStatisticsPreference("https://blog.baispace.cn/?statistics=on")).toBeNull();
    expect(withoutStatisticsPreference("https://blog.baispace.cn/?q=a")).toBeNull();
  });
});
test("work queue isolates every count by owner and counts affected feedback rather than reply rows",async()=>{
  const calls:any[]=[];
  const make=(value:number)=>({count:async(args:any)=>{calls.push(args);return value;}});
  const db={blogArticleFeedback:make(2),blogMomentFeedback:make(3),blogFriendLink:make(4),blogFriendFeedback:make(5)} as any;
  expect(await blogWorkQueue(db,42)).toEqual({feedback:5,friends:9,feedbackMail:5,friendMail:4});
  expect(calls).toHaveLength(7);
  expect(calls.every(call=>call.where.accountId===42)).toBe(true);
  expect(calls.filter(call=>call.where.replies).every(call=>call.where.status.not==="archived")).toBe(true);
});
test("sorting explanations reflect visitor context and avoid claiming semantic recall",()=>{
 const now=Date.now();
 const post={isFeatured:false,createdAt:new Date(now-100*86400000),views:0,title:"产品方法",excerpt:"设计",topics:[{id:2}]};
 const context={mode:"blended",featuredFirst:true,topicMode:false,topics:new Set([2]),terms:["产品"],seen:new Set(["a"]),publishId:"a",now};
 expect(recommendationReasons(post,context)).toEqual(["与近期阅读专题相关","与近期搜索词匹配","近期读过，已降权"]);
 expect(recommendationReasons({...post,isFeatured:true},{...context,mode:"recency",seen:new Set()})).toEqual(["作者置顶","按发布时间排序"]);
});

test("disabled signal weights do not appear as sorting reasons",()=>{
 const post={isFeatured:false,createdAt:new Date(),views:100,title:"产品方法",excerpt:"设计",topics:[{id:2}]};
 expect(recommendationReasons(post,{mode:"blended",featuredFirst:true,topicMode:false,topics:new Set([2]),terms:["产品"],seen:new Set(),publishId:"a",weights:{freshWeight:0,hotWeight:0,affinityWeight:0,searchWeight:0}})).toEqual(["综合候选排序"]);
});
