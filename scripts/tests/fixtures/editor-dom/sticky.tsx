import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { StickyListFilters } from '../../../../app/src/components/Common/StickyListFilters';
// Use the actual compiled application styles to verify sticky positioning.
import.meta.glob('../../../../dist/public/assets/index-*.css', { eager: true });
function Test() {
  const [filter, setFilter] = useState('all');
  const [scope, setScope] = useState('flash');
  return <main style={{padding:24,maxWidth:900}}><h1>列表筛选吸顶验证</h1>
    <nav><button onClick={()=>setScope('flash')}>闪念</button> · <button onClick={()=>setScope('notes')}>笔记</button> · <button onClick={()=>setScope('todo')}>待办</button><span>当前类型：{scope}</span></nav>
    <div data-testid="list-viewport" data-scroll-viewport tabIndex={0} style={{height:420,overflow:'auto',border:'1px solid #ccc'}}>
      <div style={{padding:'0 24px'}}>
        <div data-testid="composer" style={{height:240,padding:24}}>编辑框：随列表滚走</div>
        <StickyListFilters filterKey={filter} scopeKey={scope}>
          <div style={{display:'flex',gap:16}}><button onClick={()=>setFilter('all')}>全部</button><button onClick={()=>setFilter('work')}>工作</button><button onClick={()=>setFilter('empty')}>空标签</button><span>当前：{filter}</span></div>
        </StickyListFilters>
        <div data-list-filter-results>
        {Array.from({length:filter==='all'?50:filter==='work'?1:0},(_,index)=><article key={index} style={{padding:24,borderBottom:'1px solid #ddd'}}>内容 {index+1}</article>)}
        </div>
      </div>
    </div>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Test/>);
