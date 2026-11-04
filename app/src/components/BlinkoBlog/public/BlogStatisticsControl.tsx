import { useState } from "react";
import { blogStatisticsOptedOut, setBlogStatisticsOptOut } from "@/lib/blogDevice";

export function BlogStatisticsControl() {
  const [off] = useState(blogStatisticsOptedOut);
  const [error,setError] = useState(false);
  return <div className="mt-3 text-xs" aria-label="本机统计偏好">
    {off && <p role="status">本浏览器访问已排除统计。</p>}
    <button type="button" className="text-primary hover:underline" onClick={()=>{
      if(setBlogStatisticsOptOut(!off)) window.location.reload(); else setError(true);
    }}>{off?"恢复默认统计规则":"不统计本机访问"}</button>
    {error && <p role="alert">无法保存偏好，请检查浏览器存储权限。</p>}
  </div>;
}
