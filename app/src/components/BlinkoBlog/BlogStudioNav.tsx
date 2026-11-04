import { useState } from "react";
import { Icon } from "@/components/Common/Iconify/icons";
import { BlogInput } from "./BlogUI";
import { STUDIO_NAV, type StudioSection } from "./studioNav";
import "../BlinkoSettings/settings.css";

type Props = { section: StudioSection; onSelect: (key: StudioSection) => void; postCount: number; topicCount: number; work?: {feedback:number;friends:number;feedbackMail:number;friendMail:number} | null; };
export function BlogStudioNav({section,onSelect,postCount,topicCount,work}: Props) {
 const [keyword,setKeyword]=useState("");
 const query=keyword.trim().toLowerCase();
 const groups=STUDIO_NAV.map(group=>({...group,items:group.items.filter(item=>!query||[item.label,item.hint,group.title].join(" ").toLowerCase().includes(query))})).filter(group=>group.items.length);
 return <aside className="settings-sidebar blog-management-sidebar" aria-label="博客管理导航">
  <div className="settings-sidebar-heading">博客管理</div>
  <div className="blog-management-search"><BlogInput aria-label="搜索博客管理功能" placeholder="搜索功能…" value={keyword} onChange={e=>setKeyword(e.target.value)} startContent={<Icon icon="tabler:search" width={16}/>}/></div>
  <nav className="settings-navigation" aria-label="博客管理分区">
   {groups.map(group=><div key={group.title} className="settings-nav-group"><div className="settings-group-label">{group.title}</div>
    {group.items.map(item=><button key={item.key} type="button" className="settings-nav-item" aria-current={section===item.key?'page':undefined} onClick={()=>{onSelect(item.key);setKeyword("");}} title={item.hint}>
     <Icon icon={item.icon} width={18}/><span className="flex-1">{item.label}</span>{item.key==='posts'&&<span className="blog-management-count">{postCount}</span>}{item.key==='topics'&&<span className="blog-management-count">{topicCount}</span>}{(item.key==='feedback'||item.key==='friends') && work && ((item.key==='feedback'?work.feedback+work.feedbackMail:work.friends+work.friendMail)>0) && <span className="rounded-md bg-warning-50 px-1.5 text-xs font-medium text-warning" aria-label="待处理或通知异常">{item.key==='feedback'?work.feedback+work.feedbackMail:work.friends+work.friendMail}</span>}
    </button>)}
   </div>)}
   {!groups.length&&<p className="px-3 py-5 text-sm text-default-500" role="status">没有匹配的功能</p>}
  </nav>
 </aside>;
}
