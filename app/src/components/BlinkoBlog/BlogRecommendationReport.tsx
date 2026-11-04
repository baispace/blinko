import { useEffect,useState } from "react";
import { Button,Card,CardBody } from "@heroui/react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/trpc";

export function BlogRecommendationReport({version,disableNavigation=false}:{version:string;disableNavigation?:boolean}) {
  const [data,setData]=useState<Awaited<ReturnType<typeof api.blog.distributionReport.query>>|null>(null);
  const [error,setError]=useState(false),[busy,setBusy]=useState(false);
  const [refresh,setRefresh]=useState(0);
  const navigate=useNavigate();
  useEffect(()=>{let active=true;setBusy(true);setError(false);
    void api.blog.distributionReport.query().then(value=>{if(active)setData(value);}).catch(()=>{if(active)setError(true);}).finally(()=>{if(active)setBusy(false);});
    return()=>{active=false;};
  },[version,refresh]);
  return <Card className="rounded-xl border border-default-200 shadow-none"><CardBody className="gap-3 p-4">
    <div className="flex items-center justify-between gap-3"><h3 className="text-base font-semibold">分发效果与排序依据</h3><Button size="sm" variant="flat" isDisabled={busy} onPress={()=>setRefresh(n=>n+1)}>{busy?"加载中…":"刷新"}</Button></div>
    {error?<p role="alert" className="text-sm text-danger">暂时无法读取效果数据，请重试。</p>:data?<>
      <p className="text-xs text-default-500">最近7天的站内列表分发信号；不是某次策略修改的实验对照。更新于 {new Date(data.checkedAt).toLocaleString("zh-CN")}</p>
      <div className="grid grid-cols-3 gap-3">{[["列表曝光",data.metrics.impressions],["列表点击",data.metrics.clicks],["点击率",data.metrics.impressions?`${(data.metrics.ctr*100).toFixed(1)}%`:"—"]].map(([label,value])=><div key={label} className="rounded-lg bg-default-50 p-3"><p className="text-xs text-default-500">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p></div>)}</div>
      <div><h4 className="text-sm font-medium">当前公开文章排序示例</h4><p className="mt-1 text-xs text-default-500">使用已保存的策略，按无阅读历史的访客计算；实际读者可能看到不同顺序。当前采用新品、热门、专题和关键词匹配，未启用向量语义召回。</p></div>
      {data.samples.length?data.samples.map(post=><button key={post.id} type="button" disabled={disableNavigation} title={disableNavigation?"请先保存策略或撤销修改":"打开文章管理"} onClick={()=>navigate(`/blog-manage/content/${post.id}`)} className="flex flex-wrap items-center justify-between gap-2 border-t border-default-100 py-2 text-left hover:text-primary"><span className="min-w-0 flex-1 text-sm">{post.title}</span><span className="text-xs text-default-500">{post.reasons.join(" · ")}</span></button>):<p className="text-sm text-default-500">发布文章后，这里会展示排序示例。</p>}
    </>:<p className="text-sm text-default-500" role="status">正在读取分发数据…</p>}
  </CardBody></Card>;
}
