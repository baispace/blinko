import sharp from "sharp";
import {coverIconBounds} from "../../shared/lib/coverIconBounds";
import { standardCoverTile } from "./coverStandardTile";
import { TRPCError } from "@trpc/server";

export type CoverIllustrationOptions = { kind?: "tile"; background?: "chroma" };

/** 色相（0–360）与饱和度：无彩色返回 -1。 */
function hueOf(r: number, g: number, b: number) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d < 8) return -1;
  let h: number;
  if (max === r) h = 60 * (((g - b) / d) % 6);
  else if (max === g) h = 60 * ((b - r) / d + 2);
  else h = 60 * ((r - g) / d + 4);
  return h < 0 ? h + 360 : h;
}

/** 两个色相之间的最短夹角。 */
function hueDistance(a: number, b: number) {
  if (a < 0 || b < 0) return 180;
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

export class CoverIntegrityError extends TRPCError {}

/**
 * 失败要说清是哪一条没过。
 *
 * 之前所有原因共用一句话，作者和验收脚本都只知道「没过检查」，
 * 不知道是底色不对、砖的比例不对，还是图里根本不是图标。
 */
const invalidTile = (reason: string) =>
  new CoverIntegrityError({
    code: "BAD_REQUEST",
    message: `封面图标未通过完整性检查：${reason}。本次图片未应用，请重新生成或更换模型。`,
  });

/** New tiles use a contrasting matte: white ceramic must never be keyed as white background. */
export async function prepareCoverIllustration(input: Buffer, options: CoverIllustrationOptions = {}): Promise<Buffer> {
  const {data,info}=await sharp(input,{limitInputPixels:40000000}).rotate().resize({width:1024,height:1024,fit:"inside",withoutEnlargement:true}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const {width:w,height:h}=info;
  let transparent=0;for(let i=3;i<data.length;i+=4)if(data[i]<16)transparent++;
  const transparentInput=transparent>w*h*.02;
  /*
   * 专色底不能写死成「洋红」。
   *
   * 真实出图验收里量到过三种底色：正洋红（#f5a5cc 一族）、暖粉（#f7868b），
   * 甚至蜜桃色（#facdb6 一族，r−g 只有 45、蓝通道比绿通道低 20）。
   * 写死「必须像洋红」的话，暖粉与蜜桃底每次都被判死 —— 生成看着成功，
   * 实际每一张都悄悄回落成标准图标砖，AI 等于白跑。
   *
   * 所以底色从图片边缘反推：取边缘一圈像素的中位色当底色，
   * 再用「色相接近 + 不太灰」判定背景像素。象牙白砖面（饱和度≈15）
   * 与任何有色底都差得开，不会被误抠。
   */
  const border:number[]=[];
  for(let x=0;x<w;x++){border.push(x);border.push((h-1)*w+x);}
  for(let y=0;y<h;y++){border.push(y*w);border.push(y*w+w-1);}
  const medianOf=(offset:number)=>{
    const values=border.map(i=>data[i*4+offset]).sort((a,b)=>a-b);
    return values[Math.floor(values.length/2)];
  };
  const matteHue=hueOf(medianOf(0),medianOf(1),medianOf(2));
  const matteSat=Math.max(medianOf(0),medianOf(1),medianOf(2))-Math.min(medianOf(0),medianOf(1),medianOf(2));
  // i 是像素下标，RGB 在 i*4 起的三个字节上。
  const mattePixel=(i:number,hueTol:number,satFloor:number)=>{
    const r=data[i*4],g=data[i*4+1],b=data[i*4+2];
    const h=hueOf(r,g,b);
    if(h<0)return false;
    return hueDistance(h,matteHue)<=hueTol&&Math.max(r,g,b)-Math.min(r,g,b)>=satFloor;
  };
  /*
   * 底色至少要有颜色，白底一律不算专色底（否则会把象牙白砖面一起抠掉）。
   *
   * 这里只把「完全没颜色」的底色挡掉，不去卡深浅 ——
   * 底色够不够好抠，交给后面的比例/破损检查去判（那里的判据是砖还在不在）。
   * 一开始在这里卡「饱和度≥80」，结果把饱和度 75 的粉色渐变底也毙了，
   * 而那批图其实抠得干干净净。
   */
  const chroma = matteSat>=35 && matteHue>=0 &&
    border.filter(i=>mattePixel(i,40,Math.max(24,matteSat*.35))).length/border.length>.7;
  // A strict generation call never falls back to deleting white pixels.
  if(options.background==="chroma" && !transparentInput && !chroma)
    throw invalidTile(`背景不是可分离的纯色底（模型给的底色太浅或不是专色，实测饱和度 ${Math.round(matteSat)}）`);
  const seen=new Uint8Array(w*h),queue=new Int32Array(w*h);let head=0,tail=0;
  const visit=(x:number,y:number)=>{const n=y*w+x,i=n*4;if(seen[n])return;
    const min=Math.min(data[i],data[i+1],data[i+2]),max=Math.max(data[i],data[i+1],data[i+2]);
    // n 是像素下标，mattePixel 按像素下标取色（i 是字节偏移，别混用）。
    /*
     * 饱和度门槛要跟着底色走：底色越淡，门槛就得越高。
     * 蜜桃底（饱和度≈64）与暖奶油砖面（≈30）色相很近，
     * 门槛定低了（28）会把整块砖面一起抠掉 —— 那就等于没有生成。
     */
    /*
     * 饱和度门槛要跟着底色走：底色越淡，门槛就得越高。
     * 蜜桃底（饱和度≈64）与暖奶油砖面（≈40）色相很近，门槛定低了
     * 会把砖面一起抠掉 —— 那就等于没生成。取底色饱和度的八成：
     * 底色本身照抠，砖面（比例≈0.6）安全。
     */
    const removable = data[i+3]<16 || (!transparentInput && (chroma ? mattePixel(n,30,Math.max(30,matteSat*.8)) : min>=235&&max-min<=16));
    if(removable){seen[n]=1;queue[tail++]=n;}
  };
  for(let x=0;x<w;x++){visit(x,0);visit(x,h-1);}for(let y=0;y<h;y++){visit(0,y);visit(w-1,y);}
  while(head<tail){const n=queue[head++],x=n%w,y=Math.floor(n/w);data[n*4]=0;data[n*4+1]=0;data[n*4+2]=0;data[n*4+3]=0;if(x)visit(x-1,y);if(x<w-1)visit(x+1,y);if(y)visit(x,y-1);if(y<h-1)visit(x,y+1);}
  // Remove only a thin, matte-tinted fringe next to the removed background.
  // Never expand white-keying into the ceramic face, and never repeat on saved transparent assets.
  if(chroma && !transparentInput) for(let pass=0;pass<3;pass++) {
    const fringe:number[]=[];
    for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
      const n=y*w+x,i=n*4;if(data[i+3]<16)continue;
      // 影子与描边是底色的暗版：色相还在，但更灰。放宽饱和度门槛把它们清掉，
      // 同时守住象牙白砖面（饱和度只有 15，不会被这条误伤）。
      // 影子与描边是底色的暗版：色相还在，但更灰 —— 门槛比主抠除松一档。
      const tinted=mattePixel(n,25,Math.max(24,matteSat*.55));
      if(tinted && [n-1,n+1,n-w,n+w].some(k=>data[k*4+3]<16)) fringe.push(n);
    }
    for(const n of fringe){data[n*4]=0;data[n*4+1]=0;data[n*4+2]=0;data[n*4+3]=0;}
  }
  /*
   * 只留最大的一块。
   *
   * 底色是渐变时，抠完总会剩一点边角料（更亮的那一端）。它们虽然只有指甲盖大，
   * 却会把「图形外接框」撑成一条歪的带子 —— 后面按方砖比例检查时，
   * 一张明明干净的砖就被判成「残边」。
   *
   * 所以先找出最大的连通块（砖本身），其余零散的像素全部丢掉。
   */
  {
    const label=new Int32Array(w*h).fill(-1);
    const stack=new Int32Array(w*h);
    const cx=w/2,cy=h/2;
    let best=-1,bestDist=Infinity,bestSize=0,current=0;
    for(let start=0;start<w*h;start++){
      if(data[start*4+3]<=16||label[start]>=0)continue;
      let top=0;stack[top++]=start;label[start]=current;
      let size=0,sumX=0,sumY=0;
      while(top>0){
        const n=stack[--top];size++;
        const x=n%w,y=(n/w)|0;sumX+=x;sumY+=y;
        if(x>0&&data[(n-1)*4+3]>16&&label[n-1]<0){label[n-1]=current;stack[top++]=n-1;}
        if(x<w-1&&data[(n+1)*4+3]>16&&label[n+1]<0){label[n+1]=current;stack[top++]=n+1;}
        if(y>0&&data[(n-w)*4+3]>16&&label[n-w]<0){label[n-w]=current;stack[top++]=n-w;}
        if(y<h-1&&data[(n+w)*4+3]>16&&label[n+w]<0){label[n+w]=current;stack[top++]=n+w;}
      }
      /*
       * 提示词要求图标居中，所以「离画面中心最近的那块」才是图标；
       * 剩下的边角料（渐变底没抠干净的那一角）一律丢掉。
       * 早先按「最大块」选，会被角落里一大片残留背景骗走 ——
       * 那一块往往比图标本身还大。
       */
      if(size>=w*h*.005){
        const mx=sumX/size,my=sumY/size;
        const d=Math.hypot(mx-cx,my-cy);
        /*
         * 画面正中的那一块才是图标。
         * 优先取「重心落在画面中间一半、且面积最大」的那块；
         * 没有这样的块，再退而求其次取离中心最近的。
         */
        const centred=Math.abs(mx-cx)<=w*.25&&Math.abs(my-cy)<=h*.25;
        if(centred&&size>bestSize){bestSize=size;best=current;bestDist=Infinity;}
        else if(!centred&&d<bestDist){bestDist=d;if(bestSize===0)best=current;}
      }
      current++;
    }
    if(best>=0)
      for(let n=0;n<w*h;n++)if(data[n*4+3]>16&&label[n]!==best){data[n*4]=0;data[n*4+1]=0;data[n*4+2]=0;data[n*4+3]=0;}
  }
  let visible=0;for(let n=0;n<w*h;n++)if(data[n*4+3]>16)visible++;
  if(tail<w*h*.02 || visible<w*h*.002)throw new CoverIntegrityError({code:"BAD_REQUEST",message:"模型未返回可分离的图案。请使用指定纯色背景、四周留白的简洁立体图标，或更换生图模型。"});
  const bounds=coverIconBounds(data,w,h);
  if(!bounds) throw invalidTile("画面里找不到成形的图标");
  if(options.kind==="tile") {
    const ratio=bounds.width/bounds.height;
    let solid=0,coreSolid=0,coreTotal=0;
    for(let y=0;y<bounds.height;y++)for(let x=0;x<bounds.width;x++){
      const alpha=data[((bounds.top+y)*w+bounds.left+x)*4+3];
      if(alpha>128)solid++;
      if(x>bounds.width*.2&&x<bounds.width*.8&&y>bounds.height*.2&&y<bounds.height*.8){coreTotal++;if(alpha>128)coreSolid++;}
    }
    // A rounded-square tile has an opaque face. A surviving J-shaped rim does not.
    if(ratio<.78||ratio>1.28) throw invalidTile(`方砖比例异常（${ratio.toFixed(2)}，应为接近 1:1）`);
    /*
     * 图标必须是一枚「留了白边的独立图形」。
     *
     * 提示词要求四周至少留 14% 空边；如果抠图没抠干净、整幅图都被留下，
     * 那抠出来的是一张满画面的图（蜜桃底那种），不是图标 —— 直接判掉，
     * 不然封面上会出现一整块底色砖。
     */
    if(bounds.width>w*.92||bounds.height>h*.92) throw invalidTile("图形几乎占满整幅画，没有抠出独立图标");
    if(solid/(bounds.width*bounds.height)<.65||coreSolid/Math.max(1,coreTotal)<.93) throw invalidTile("方砖有破损或残边");
    /*
     * 砖面要像「一枚图标」，不能是一张照片。
     *
     * 几何检查挡不住照片式砖：手机壁纸、带照片的小图标，形状比例都过得去，
     * 放到封面上却是一团脏东西（还常带着数字和字母）。
     *
     * 判据是色相档位：纯色符号（放大镜、书本、星芒）只有一两档，
     * 照片是花花绿绿几十档 —— 超过 6 档就判定为照片，回落到标准图标砖。
     * 不用「砖面要浅」这种一刀切：模型有时会在象牙白砖里再嵌一块彩色底板，
     * 那是有意设计，不该被误杀。
     */
    const buckets=new Set<number>();
    for(let y=0;y<bounds.height;y++)for(let x=0;x<bounds.width;x++){
      const i=((bounds.top+y)*w+bounds.left+x)*4;
      if(data[i+3]<128)continue;
      const r=data[i],g=data[i+1],b=data[i+2];
      const h=hueOf(r,g,b);
      if(h<0)continue;
      // 只数「有颜色」的像素；象牙白砖面饱和度约 15–39，落不进档位里。
      if(Math.max(r,g,b)-Math.min(r,g,b)>=45) buckets.add(Math.floor(h/30));
    }
    if(buckets.size>6) throw invalidTile(`图里像是照片而不是图标（色相种类 ${buckets.size} 种）`);
  }
  const pad=Math.max(4,Math.min(16,Math.round(Math.min(bounds.width,bounds.height)*.025)));
  return sharp(data,{raw:{width:w,height:h,channels:4}}).extract(bounds).extend({top:pad,bottom:pad,left:pad,right:pad,background:{r:0,g:0,b:0,alpha:0}}).webp({quality:94,alphaQuality:100}).toBuffer();
}

/**
 * 主题渐变 + 居中图标砖。
 *
 * 专题封面没有文字层，所以只铺底色与方块；文章封面走
 * server/lib/blogCoverComposition.ts 的 composeTileCoverImage，
 * 两边的方块尺寸用同一份 shared/lib/blogCoverText.ts 的规则算。
 */
export async function illustrationBase(icon:Buffer,palette:string,width=1600,height=900){
  const {coverBackdropColors,computeCoverTileLayout}=await import('../../shared/lib/blogCoverText');
  const colors=coverBackdropColors(palette);
  const tile=computeCoverTileLayout({containerWidth:width,containerHeight:height});
  const bg=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><linearGradient id="g"><stop stop-color="${colors.left}"/><stop offset="1" stop-color="${colors.right}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`);
  const inner=tile.size;
  const art=await sharp(icon).resize(inner,inner,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
  return sharp(bg).composite([
    {input:art,left:tile.left,top:tile.top},
  ]).webp({quality:94}).toBuffer();
}

/** One provider call only. A failed visual check produces a clearly identified standard option. */
export async function prepareGeneratedCover(input: Buffer, plan: {theme:string;overlayPalette:string}) {
  try { return {image:await prepareCoverIllustration(input,{kind:"tile",background:"chroma"}),generationMode:"ai" as const}; }
  catch(error) {
    if(!(error instanceof CoverIntegrityError)) throw error;
    const image=await standardCoverTile(plan.theme,plan.overlayPalette);
    return {image,generationMode:"standard" as const};
  }
}
