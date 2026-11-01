import sharp from "sharp";
import {coverIconBounds} from "../../shared/lib/coverIconBounds";
import { standardCoverTile } from "./coverStandardTile";
import { TRPCError } from "@trpc/server";

export type CoverIllustrationOptions = { kind?: "tile"; background?: "chroma" };

export class CoverIntegrityError extends TRPCError {}
const invalidTile = () => new CoverIntegrityError({code:"BAD_REQUEST",message:"封面图标未通过完整性检查：底座破损、存在残边或背景不符合要求。本次图片未应用，请重新生成或更换模型。"});

/** New tiles use a contrasting matte: white ceramic must never be keyed as white background. */
export async function prepareCoverIllustration(input: Buffer, options: CoverIllustrationOptions = {}): Promise<Buffer> {
  const {data,info}=await sharp(input,{limitInputPixels:40000000}).rotate().resize({width:1024,height:1024,fit:"inside",withoutEnlargement:true}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const {width:w,height:h}=info;
  let transparent=0;for(let i=3;i<data.length;i+=4)if(data[i]<16)transparent++;
  const transparentInput=transparent>w*h*.02;
  const pink=(i:number)=>data[i]-data[i+1]>Math.max(3,Math.max(data[i],data[i+2])*.12) && data[i+2]-data[i+1]>Math.max(2,Math.max(data[i],data[i+2])*.02);
  let matteEdges=0,edgeCount=0;
  const edge=(x:number,y:number)=>{edgeCount++;if(pink((y*w+x)*4))matteEdges++;};
  for(let x=0;x<w;x++){edge(x,0);edge(x,h-1);}for(let y=0;y<h;y++){edge(0,y);edge(w-1,y);}
  const chroma = matteEdges/edgeCount>.7;
  // A strict generation call never falls back to deleting white pixels.
  if(options.background==="chroma" && !transparentInput && !chroma) throw invalidTile();
  const seen=new Uint8Array(w*h),queue=new Int32Array(w*h);let head=0,tail=0;
  const visit=(x:number,y:number)=>{const n=y*w+x,i=n*4;if(seen[n])return;
    const min=Math.min(data[i],data[i+1],data[i+2]),max=Math.max(data[i],data[i+1],data[i+2]);
    const removable = data[i+3]<16 || (!transparentInput && (chroma ? pink(i) : min>=235&&max-min<=16));
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
      const tinted=data[i]-data[i+1]>12 && data[i+2]>=data[i+1]-8;
      if(tinted && [n-1,n+1,n-w,n+w].some(k=>data[k*4+3]<16)) fringe.push(n);
    }
    for(const n of fringe){data[n*4]=0;data[n*4+1]=0;data[n*4+2]=0;data[n*4+3]=0;}
  }
  let visible=0;for(let n=0;n<w*h;n++)if(data[n*4+3]>16)visible++;
  if(tail<w*h*.02 || visible<w*h*.002)throw new CoverIntegrityError({code:"BAD_REQUEST",message:"模型未返回可分离的图案。请使用指定纯色背景、四周留白的简洁立体图标，或更换生图模型。"});
  const bounds=coverIconBounds(data,w,h);
  if(!bounds) throw invalidTile();
  if(options.kind==="tile") {
    const ratio=bounds.width/bounds.height;
    let solid=0,coreSolid=0,coreTotal=0;
    for(let y=0;y<bounds.height;y++)for(let x=0;x<bounds.width;x++){
      const alpha=data[((bounds.top+y)*w+bounds.left+x)*4+3];
      if(alpha>128)solid++;
      if(x>bounds.width*.2&&x<bounds.width*.8&&y>bounds.height*.2&&y<bounds.height*.8){coreTotal++;if(alpha>128)coreSolid++;}
    }
    // A rounded-square tile has an opaque face. A surviving J-shaped rim does not.
    if(ratio<.78||ratio>1.28||solid/(bounds.width*bounds.height)<.65||coreSolid/Math.max(1,coreTotal)<.93) throw invalidTile();
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
