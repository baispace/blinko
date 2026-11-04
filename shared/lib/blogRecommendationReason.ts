export function recommendationReasons(post:{isFeatured:boolean;createdAt:Date;views:number;title:string;excerpt:string;topics:{id:number}[]}, input:{mode:string;featuredFirst:boolean;topicMode:boolean;topics:Set<number>;terms:string[];seen:Set<string>;publishId:string;now?:number;weights?:{freshWeight:number;hotWeight:number;affinityWeight:number;searchWeight:number}}) {
  const reasons:string[]=[];
  if(post.isFeatured && input.featuredFirst && !input.topicMode) reasons.push("作者置顶");
  if(input.mode==="recency") reasons.push("按发布时间排序");
  else if(input.mode==="clicks") reasons.push("按点击数排序");
  else if(input.mode==="ctr") reasons.push("按平滑点击率排序");
  else {
    if((input.weights?.freshWeight??1)>0 && (input.now??Date.now())-new Date(post.createdAt).getTime()<=14*86400000) reasons.push("近14天发布");
    if((input.weights?.hotWeight??1)>0 && post.views>0) reasons.push("已有阅读积累");
    if((input.weights?.affinityWeight??1)>0 && post.topics.some(topic=>input.topics.has(topic.id))) reasons.push("与近期阅读专题相关");
    const text=(post.title+" "+post.excerpt).toLocaleLowerCase();
    if((input.weights?.searchWeight??1)>0 && input.terms.some(term=>text.includes(term.toLocaleLowerCase()))) reasons.push("与近期搜索词匹配");
  }
  if(input.seen.has(input.publishId)) reasons.push("近期读过，已降权");
  return reasons.length ? reasons : ["综合候选排序"];
}
