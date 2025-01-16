import { prisma } from "../prisma";

import { RECOMMAND_TASK_NAME } from "@/lib/constant";
import { BaseScheduleJob } from "./baseScheduleJob";
import { attachmentsSchema, tagSchema, tagsToNoteSchema } from "@/lib/prismaZodType";
import { z } from "zod";
import { notesSchema } from "@/lib/prismaZodType";
import axios from "axios";

export const recommandListSchema = z.array(notesSchema.merge(
  z.object({
    attachments: z.array(attachmentsSchema).optional(),
    account: z.object({
      image: z.string().optional(),
      nickname: z.string().optional(),
      name: z.string().optional(),
      id: z.number().optional(),
    }).nullable().optional(),
    tags: z.array(tagsToNoteSchema.merge(
      z.object({
        tag: tagSchema
      })).optional()
    ).nullable().optional(),
    _count: z.object({
      comments: z.number()
    }).optional(),
    originURL: z.string().optional()
  }))
)

export type RecommandListType = z.infer<typeof recommandListSchema>

export class RecommandJob extends BaseScheduleJob {
  protected static taskName = RECOMMAND_TASK_NAME;
  protected static job = this.createJob();

  static {
    prisma.follows.findMany({
      where: {
        followType: 'following'
      }
    }).then(follows => {
      console.log(follows, 'followsxxx')
      if (follows.length > 0) {
        this.autoStart("0 */6 * * *");//6 hours
      }
    }).catch(error => {
      console.error('Error initializing RecommandJob:', error);
    });
  }

  static async RunTask() {
    try {
      console.log('Run Cache Recommand List at', new Date().toISOString())
      const follows = await prisma.follows.findMany({
        where: {
          followType: 'following'
        }
      })
      const cachedList: { [key: string]: RecommandListType } = {}

      await Promise.all(follows.map(async (follow) => {
        const url = new URL(follow.siteUrl)
        const publicList = await axios.post<RecommandListType>(`${url.origin}/api/v1/note/public-list`, {
          page: 1,
          size: 30
        })
        cachedList[follow.accountId] = [
          ...(cachedList[follow.accountId] || []),
          ...publicList.data.map(i => {
            i.attachments?.map(a => {
              a.path = `${url.origin}${a.path}`
            })
            return {
              ...i,
              originURL: url.origin
            }
          })
        ]
      }))

      console.log(cachedList)
      const hasCache = await prisma.cache.findFirst({
        where: {
          key: 'recommand_list'
        }
      })
      if (hasCache) {
        await prisma.cache.update({
          where: { id: hasCache.id },
          //@ts-ignore
          data: { value: cachedList }
        })
      } else {
        //@ts-ignore
        await prisma.cache.create({ data: { key: 'recommand_list', value: cachedList } })
      }
    } catch (error) {
      throw new Error(error)
    }
  }
}