import { expect,test } from 'bun:test';
import { quickModelSetupSchema } from '../../shared/lib/quickModelSetup';
import { siteIconSchema } from '../../shared/lib/siteBranding';
import { quickModelSetup } from '../../server/lib/quickModelSetup';
const connection={title:'Test provider',provider:'openai' as const,baseURL:'https://example.com/v1',apiKey:'test-key'};
test('simple setup requires exactly one provider source and valid connection details',()=>{
  expect(quickModelSetupSchema.safeParse({modelKey:'chat-test'}).success).toBe(false);
  expect(quickModelSetupSchema.safeParse({providerId:1,provider:connection,modelKey:'chat-test'}).success).toBe(false);
  expect(quickModelSetupSchema.safeParse({provider:{...connection,apiKey:''},modelKey:'chat-test'}).success).toBe(false);
  expect(quickModelSetupSchema.safeParse({provider:{...connection,baseURL:'javascript:alert(1)'},modelKey:'chat-test'}).success).toBe(false);
  expect(quickModelSetupSchema.safeParse({providerId:1,modelKey:'chat-test'}).success).toBe(true);
  expect(quickModelSetupSchema.safeParse({provider:{...connection,provider:'ollama',apiKey:''},modelKey:'chat-test'}).success).toBe(true);
});
test('site icons accept raster data and reject remote, script and SVG URLs',()=>{
  expect(siteIconSchema.safeParse('').success).toBe(true);
  expect(siteIconSchema.safeParse('data:image/png;base64,aGVsbG8=').success).toBe(true);
  for(const value of ['https://example.com/icon.png','javascript:alert(1)','data:image/svg+xml;base64,aGVsbG8=']) expect(siteIconSchema.safeParse(value).success).toBe(false);
});
function fixture(){
  let data:any={providers:[],models:[],configs:[]};let failModel=false;
  const db:any={aiProviders:{findUnique:async({where}:any)=>data.providers.find((row:any)=>row.id===where.id),create:async({data:value}:any)=>{const row={id:1,...value};data.providers.push(row);return row;}},aiModels:{findFirst:async({where}:any)=>data.models.find((row:any)=>row.providerId===where.providerId&&row.modelKey===where.modelKey),create:async({data:value}:any)=>{if(failModel)throw new Error('model write failed');const row={id:5,...value};data.models.push(row);return row;}},config:{findFirst:async()=>data.configs[0],create:async({data:value}:any)=>{data.configs.push({id:1,...value});},updateMany:async({data:value}:any)=>Object.assign(data.configs[0],value)}};
  const client:any={$transaction:async(fn:any)=>{const before=structuredClone(data);try{return await fn(db);}catch(error){data=before;throw error;}}};
  return {client,data:()=>data,fail:()=>{failModel=true;}};
}
test('simple setup saves provider, model and default together and reuses existing models',async()=>{
  const state=fixture();const first=await quickModelSetup({provider:connection,modelKey:'chat-test',makeDefault:true},'superadmin',state.client);
  expect(state.data().configs[0].config.value).toBe(first.modelId);
  await quickModelSetup({providerId:first.providerId,modelKey:'chat-test',makeDefault:false},'superadmin',state.client);
  expect(state.data().models.length).toBe(1);expect(state.data().providers.length).toBe(1);
});
test('failed setup rolls back the new connection and non-admins cannot write',async()=>{
  const state=fixture();state.fail();
  await expect(quickModelSetup({provider:connection,modelKey:'chat-test',makeDefault:true},'superadmin',state.client)).rejects.toThrow();
  expect(state.data()).toEqual({providers:[],models:[],configs:[]});
  await expect(quickModelSetup({provider:connection,modelKey:'chat-test',makeDefault:false},'user',state.client)).rejects.toThrow();
  await expect(quickModelSetup({provider:connection,modelKey:'text-embedding-3-small',makeDefault:true},'superadmin',state.client)).rejects.toThrow();
  expect(state.data().providers.length).toBe(0);
});
const integration=process.env.RUN_SETTINGS_DB_TESTS==='1'?test:test.skip;
integration('simple model setup writes the model and default in a real rolled-back transaction',async()=>{
  const {prisma}=await import('../../server/prisma');
  const rollback=new Error('ROLLBACK_MODEL_TEST');
  try{await prisma.$transaction(async db=>{
    const id=2_000_000_000 + Math.floor(Math.random()*1000000);
    const provider=await db.aiProviders.create({data:{id,title:'Rollback test',provider:'openai',baseURL:'https://example.com/v1',apiKey:''}});
    const client={$transaction:(fn:any)=>fn(db)} as any;
    const result=await quickModelSetup({providerId:provider.id,modelKey:'rollback-test-chat',makeDefault:true},'superadmin',client);
    expect((await db.aiModels.findUnique({where:{id:result.modelId}}))?.providerId).toBe(provider.id);
    const config=await db.config.findFirst({where:{key:'mainModelId',userId:null},orderBy:{id:'asc'}});
    expect((config?.config as any)?.value).toBe(result.modelId);
    throw rollback;
  });}catch(error){if(error!==rollback)throw error;}
});
