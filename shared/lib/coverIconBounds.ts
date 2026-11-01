/** Ignore disconnected corner noise when measuring a generated icon's optical bounds. */
export function coverIconBounds(data: ArrayLike<number>, width: number, height: number) {
  const seen=new Uint8Array(width*height), queue=new Int32Array(width*height);
  const parts: {left:number;top:number;right:number;bottom:number;count:number}[]=[];
  for(let start=0;start<width*height;start++) {
    if(seen[start] || data[start*4+3]<24) continue;
    let head=0,tail=1;queue[0]=start;seen[start]=1;
    const p={left:width,top:height,right:0,bottom:0,count:0};
    while(head<tail) {
      const n=queue[head++],x=n%width,y=Math.floor(n/width);p.count++;
      p.left=Math.min(p.left,x);p.right=Math.max(p.right,x);p.top=Math.min(p.top,y);p.bottom=Math.max(p.bottom,y);
      for(const next of [x>0?n-1:-1,x<width-1?n+1:-1,y>0?n-width:-1,y<height-1?n+width:-1]) {
        if(next>=0&&!seen[next]&&data[next*4+3]>=24){seen[next]=1;queue[tail++]=next;}
      }
    }
    parts.push(p);
  }
  parts.sort((a,b)=>b.count-a.count);
  const main=parts[0];if(!main)return null;
  const margin=Math.max(main.right-main.left, main.bottom-main.top)*.18;
  const kept=parts.filter(p=>p===main || (p.count>=main.count*.005 && p.left<=main.right+margin && p.right>=main.left-margin && p.top<=main.bottom+margin && p.bottom>=main.top-margin));
  const left=Math.min(...kept.map(p=>p.left)),top=Math.min(...kept.map(p=>p.top));
  return {left,top,width:Math.max(...kept.map(p=>p.right))-left+1,height:Math.max(...kept.map(p=>p.bottom))-top+1};
}
