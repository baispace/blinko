import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { prisma } from '../prisma';
import { quickModelSetupSchema } from '../../shared/lib/quickModelSetup';
import { inferModelCapabilities } from '../../shared/lib/modelTemplates';
export async function quickModelSetup(input:z.infer<typeof quickModelSetupSchema>, role:string, client=prisma) {
  if(role !== 'superadmin') throw new TRPCError({ code:'FORBIDDEN',message:'仅管理员可以配置模型' });
  const clean=quickModelSetupSchema.parse(input);
  const capabilities=inferModelCapabilities(clean.modelKey);
  if(!capabilities.inference) throw new TRPCError({code:'BAD_REQUEST',message:'此入口用于对话模型，向量、语音等模型请通过高级配置添加'});
  return client.$transaction(async db => {
    const provider=clean.providerId ? await db.aiProviders.findUnique({where:{id:clean.providerId}}) : await db.aiProviders.create({data:clean.provider!});
    if(!provider) throw new TRPCError({code:'NOT_FOUND',message:'服务商已不存在，请重新选择'});
    let model=await db.aiModels.findFirst({where:{providerId:provider.id,modelKey:clean.modelKey}});
    if(!model) model=await db.aiModels.create({data:{providerId:provider.id,modelKey:clean.modelKey,title:clean.modelKey,capabilities:{...capabilities,inference:true}}});
    if(clean.makeDefault && !(model.capabilities as any)?.inference) throw new TRPCError({code:'BAD_REQUEST',message:'此模型尚未启用对话能力，请在编辑模型中检查配置'});
    if(clean.makeDefault) {
      const current=await db.config.findFirst({where:{key:'mainModelId',userId:null},orderBy:{id:'asc'}});
      const config={type:'number',value:model.id};
      if(current) await db.config.updateMany({where:{key:'mainModelId',userId:null},data:{config}});
      else await db.config.create({data:{key:'mainModelId',config}});
    }
    return {providerId:provider.id,modelId:model.id};
  });
}
