import { afterAll, expect, mock, test } from 'bun:test';
mock.module('../../app/src/lib/trpc', () => ({ api: { fonts: { getFontData: { query: async () => ({ fileData: 'd09GMg==' }) } } } }));
const originalDocument = globalThis.document;
const originalFace = globalThis.FontFace;
const originalStorage = globalThis.localStorage;
const originalWindow = globalThis.window;
let lastLink: any;
const values = new Map<string,string>();
const faces = new Set<any>();
const releases = new Map<string,()=>void>();
const style = () => ({ fontFamily:'', setProperty(key:string,value:string) { (this as any)[key]=value; } });
globalThis.localStorage = {getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)} as any;
globalThis.window = {location:{origin:'http://ink.test'},localStorage:globalThis.localStorage} as any;
globalThis.document = {body:{style:style()},documentElement:{style:style()},querySelector:()=>null,querySelectorAll:()=>[],createElement:()=>({setAttribute(){},textContent:''}),head:{appendChild(node:any){if(node.rel==='stylesheet')lastLink=node;}},fonts:{add:(face:any)=>faces.add(face),values:()=>faces.values(),load:async()=>[],check:()=>false}} as any;
globalThis.FontFace = class {
  status='unloaded';
  constructor(public family:string){}
  load(){return new Promise(resolve=>releases.set(this.family,()=>{this.status='loaded';resolve(this);}));}
} as any;
const {FontManager}=await import('../../app/src/lib/fontManager');
const metadata=(name:string)=>({id:1,name,displayName:name,url:null,isLocal:true,weights:[400],category:'sans-serif',isSystem:false,sortOrder:0});
const waitForLoad=async(name:string)=>{for(let i=0;i<30&&!releases.has(name);i++)await new Promise(resolve=>setTimeout(resolve,1));expect(releases.has(name)).toBe(true);};
test('font family changes only after glyph loading completes',async()=>{
  FontManager.initializeRegistry([metadata('PreparedFont')]);
  document.body.style.fontFamily='ExistingFont';
  const pending=FontManager.applyFont('PreparedFont');
  await waitForLoad('PreparedFont');
  expect(document.body.style.fontFamily).toBe('ExistingFont');
  releases.get('PreparedFont')!();
  expect(await pending).toBe(true);
  expect(document.body.style.fontFamily).toContain('PreparedFont');
});
test('returning to system font cancels an older pending application',async()=>{
  FontManager.initializeRegistry([metadata('OlderFont')]);
  const pending=FontManager.applyFont('OlderFont');
  await waitForLoad('OlderFont');
  document.documentElement.style.fontFamily='Old saved inline stack';
  await FontManager.applyFont('default');
  releases.get('OlderFont')!();
  expect(await pending).toBe(false);
  expect(document.body.style.fontFamily).toBe('');
  expect(document.documentElement.style.fontFamily).toBe('');
});
test('bundled stylesheet missing from CDN falls back to the origin',async()=>{
  FontManager.initializeRegistry([{...metadata('LXGW WenKai'),isLocal:false,url:'https://cdn.example.com/ink/font-assets/lxgw-wenkai/1.7.0/style.css'}]);
  const pending=FontManager.applyFont('LXGW WenKai');
  expect(lastLink.href).toBe('https://cdn.example.com/ink/font-assets/lxgw-wenkai/1.7.0/style.css');
  lastLink.onerror();
  expect(lastLink.href).toBe('http://ink.test/font-assets/lxgw-wenkai/1.7.0/style.css');
  faces.add({family:'LXGW WenKai',status:'loaded'});
  lastLink.onload();
  expect(await pending).toBe(true);
});
afterAll(()=>{globalThis.document=originalDocument;globalThis.FontFace=originalFace;globalThis.localStorage=originalStorage;globalThis.window=originalWindow;});
