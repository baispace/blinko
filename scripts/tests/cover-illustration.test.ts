import {test,expect} from 'bun:test';
import {createRequire} from 'node:module';
const sharp=createRequire(new URL('../../server/package.json',import.meta.url))('sharp');
import {prepareCoverIllustration,illustrationBase} from '../../server/lib/coverIllustration';
async function icon(){const blue=await sharp({create:{width:60,height:60,channels:3,background:'#0066dd'}}).png().toBuffer();const white=await sharp({create:{width:30,height:30,channels:3,background:'#fff'}}).png().toBuffer();return sharp({create:{width:100,height:100,channels:3,background:'#fff'}}).composite([{input:blue,left:20,top:20},{input:white,left:35,top:35}]).png().toBuffer();}
test('removes exterior white but preserves enclosed white panel',async()=>{const out=await prepareCoverIllustration(await icon());const {data,info}=await sharp(out).ensureAlpha().raw().toBuffer({resolveWithObject:true});expect(data[3]).toBe(0);const mid=(Math.floor(info.height/2)*info.width+Math.floor(info.width/2))*4;expect(data[mid]).toBeGreaterThan(245);expect(data[mid+3]).toBe(255);});
test('rejects complex opaque backdrops rather than silently passing a full image',async()=>{const b=await sharp({create:{width:100,height:100,channels:3,background:'#7755cc'}}).png().toBuffer();await expect(prepareCoverIllustration(b)).rejects.toThrow('模型未返回可分离的图案');});
test('transparent icon composes onto bounded theme background',async()=>{const out=await illustrationBase(await prepareCoverIllustration(await icon()),'blue',1000,345);const meta=await sharp(out).metadata();expect([meta.width,meta.height]).toEqual([1000,345]);expect(meta.format).toBe('webp');});
test('existing transparent white silhouettes are never treated as white backgrounds',async()=>{const white=await sharp({create:{width:60,height:60,channels:4,background:'#ffffff'}}).png().toBuffer();const source=await sharp({create:{width:100,height:100,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:white,left:20,top:20}]).png().toBuffer();const output=await prepareCoverIllustration(source);const stats=await sharp(output).stats();expect(stats.channels[3].max).toBe(255);});

import { coverIconBounds } from '../../shared/lib/coverIconBounds';
test('isolated corner noise cannot move the icon optical center', () => {
  const w=200,h=200,data=new Uint8Array(w*h*4);
  for(let y=80;y<180;y++)for(let x=40;x<160;x++)data[(y*w+x)*4+3]=255;
  for(let x=70;x<130;x++)data[(5*w+x)*4+3]=255;
  expect(coverIconBounds(data,w,h)).toEqual({left:40,top:80,width:120,height:100});
});

async function tileOn(background:string) {
 return sharp({create:{width:300,height:300,channels:3,background}}).composite([
 {input:Buffer.from('<svg width="200" height="200"><rect width="200" height="200" rx="30" fill="white"/><circle cx="100" cy="100" r="36" fill="#22b88a"/></svg>'),left:50,top:50}
 ]).png().toBuffer();
}
test('contrasting matte removes only background and preserves the white ceramic tile',async()=>{
 const out=await prepareCoverIllustration(await tileOn('#ff00ff'),{kind:'tile',background:'chroma'});
 const {data,info}=await sharp(out).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const x=Math.round(info.width*.25),y=Math.round(info.height*.5),i=(y*info.width+x)*4;
 expect(data[i]).toBeGreaterThan(245);expect(data[i+3]).toBe(255);
 expect(data[3]).toBe(0);
});
test('strict tile generation refuses white-on-white rather than cutting the tile face away',async()=>{
 await expect(prepareCoverIllustration(await tileOn('#fff'),{kind:'tile',background:'chroma'})).rejects.toThrow('完整性检查');
});
test('a J-shaped surviving rim cannot be accepted as a complete icon tile',async()=>{
 const source=await sharp({create:{width:220,height:220,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([
 {input:Buffer.from('<svg width="220" height="220"><path d="M200 10V200H10" fill="none" stroke="white" stroke-width="20"/><rect x="45" y="45" width="75" height="75" fill="#7777ff"/></svg>'),left:0,top:0}
 ]).png().toBuffer();
 await expect(prepareCoverIllustration(source,{kind:'tile'})).rejects.toThrow('完整性检查');
});

test('pink background with provider lighting variation is still separated without erasing white',async()=>{
 const raw=await sharp(Buffer.from('<svg width="300" height="300"><defs><linearGradient id="p"><stop stop-color="#f5a5cc"/><stop offset="1" stop-color="#ee78b0"/></linearGradient></defs><rect width="300" height="300" fill="url(#p)"/><rect x="50" y="50" width="200" height="200" rx="30" fill="#fffaf0"/><circle cx="150" cy="150" r="38" fill="#269b77"/></svg>')).png().toBuffer();
 const out=await prepareCoverIllustration(raw,{kind:'tile',background:'chroma'});
 const {data,info}=await sharp(out).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const i=(Math.floor(info.height/2)*info.width+Math.floor(info.width*.25))*4;
 expect(data[i+3]).toBe(255);expect(data[i]).toBeGreaterThan(245);
 expect([...data.subarray(0,4)]).toEqual([0,0,0,0]);
});

/*
 * 模型未必照着 #FF00FF 画：MiniMax 常常把「洋红」画成暖一点的粉
 * （r≈250、g≈b≈135），蓝通道并没有明显高于绿通道。
 * 这张图复刻那个形状：暖粉底 + 一枚压着投影的象牙白方砖 + 橙色图标。
 * 底色要抠得掉，投影不能留，砖面和图标不能被误伤。
 */
test('a warm pink backdrop is keyed out without eating the tile face or leaving a shadow',async()=>{
 const raw=await sharp(Buffer.from('<svg width="300" height="300"><rect width="300" height="300" fill="#f7868b"/><rect x="60" y="70" width="200" height="200" rx="30" fill="#e34545"/><rect x="50" y="50" width="200" height="200" rx="30" fill="#fcead5"/><circle cx="150" cy="150" r="38" fill="#f68a3d"/></svg>')).png().toBuffer();
 const out=await prepareCoverIllustration(raw,{kind:'tile',background:'chroma'});
 const {data,info}=await sharp(out).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const at=(x:number,y:number)=>{const i=(y*info.width+x)*4;return [data[i],data[i+1],data[i+2],data[i+3]];};
 // 四角是背景，必须透明。
 expect([...data.subarray(0,4)]).toEqual([0,0,0,0]);
 expect(at(info.width-1,0)[3]).toBe(0);
 expect(at(0,info.height-1)[3]).toBe(0);
 // 砖面要留住：中心附近是不透明的浅色。
 const face=at(Math.floor(info.width/2),Math.floor(info.height/2));
 expect(face[3]).toBe(255);
 expect(face[0]).toBeGreaterThan(240);
 // 投影不能残留：不透明像素里不该再有粉色。
 let pinkLeft=0,visible=0;
 for(let n=0;n<info.width*info.height;n++){
  const i=n*4;if(data[i+3]<=16)continue;visible++;
  if(data[i]-data[i+1]>60&&data[i+2]-data[i+1]>=-8)pinkLeft++;
 }
 expect(visible).toBeGreaterThan(info.width*info.height*.6);
 expect(pinkLeft).toBe(0);
});

import {prepareGeneratedCover} from '../../server/lib/coverIllustration';
test('quality fallback is explicit and never hides an invalid image payload',async()=>{
 const result=await prepareGeneratedCover(await tileOn('#fff'),{theme:'retrieval',overlayPalette:'green'});
 expect(result.generationMode).toBe('standard');
 await expect(prepareCoverIllustration(result.image,{kind:'tile'})).resolves.toBeInstanceOf(Buffer);
 await expect(prepareGeneratedCover(Buffer.from('not an image'),{theme:'ai',overlayPalette:'violet'})).rejects.toThrow();
});
