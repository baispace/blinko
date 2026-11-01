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
