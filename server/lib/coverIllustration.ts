import sharp from "sharp";
import {coverIconBounds} from "../../shared/lib/coverIconBounds";
import { TRPCError } from "@trpc/server";

/** Remove only neutral, edge-connected studio background; never remove enclosed white UI faces. */
export async function prepareCoverIllustration(input: Buffer): Promise<Buffer> {
  const {data,info}=await sharp(input,{limitInputPixels:40000000}).rotate().resize({width:1024,height:1024,fit:"inside",withoutEnlargement:true}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const {width:w,height:h}=info;
  let transparent=0;for(let i=3;i<data.length;i+=4)if(data[i]<16)transparent++;
  const transparentInput=transparent>w*h*.08;
  const seen=new Uint8Array(w*h); const queue=new Int32Array(w*h);let head=0,tail=0;
  const visit=(x:number,y:number)=>{const n=y*w+x,i=n*4;if(seen[n])return;const min=Math.min(data[i],data[i+1],data[i+2]),max=Math.max(data[i],data[i+1],data[i+2]);if(data[i+3]<16 || (!transparentInput&&min>=235&&max-min<=16)){seen[n]=1;queue[tail++]=n;}};
  for(let x=0;x<w;x++){visit(x,0);visit(x,h-1);}for(let y=0;y<h;y++){visit(0,y);visit(w-1,y);}
  while(head<tail){const n=queue[head++],x=n%w,y=Math.floor(n/w);data[n*4+3]=0;if(x)visit(x-1,y);if(x<w-1)visit(x+1,y);if(y)visit(x,y-1);if(y<h-1)visit(x,y+1);}
  let visible=0;for(let n=0;n<w*h;n++)if(data[n*4+3]>16)visible++;
  if(tail<w*h*.08 || visible<w*h*.002)throw new TRPCError({code:"BAD_REQUEST",message:"模型未返回可分离的图案。请使用透明底或纯白底、四周留白的简洁立体图标，或更换生图模型。"});
  const bounds=coverIconBounds(data,w,h);
  if(!bounds) throw new TRPCError({code:"BAD_REQUEST",message:"生成图案为空，请重新生成。"});
  return sharp(data,{raw:{width:w,height:h,channels:4}}).extract(bounds).extend({top:16,bottom:16,left:16,right:16,background:{r:0,g:0,b:0,alpha:0}}).webp({quality:94,alphaQuality:100}).toBuffer();
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
