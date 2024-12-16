import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import packageJson from '../../../package.json'
import axios from 'axios'
import { cache } from '@/lib/cache';
import { unfurl } from 'unfurl.js'
import { Metadata } from 'unfurl.js/dist/types';
import pLimit from 'p-limit';
import { FileService } from '../plugins/files';
const limit = pLimit(5);

export const publicRouter = router({
  version: publicProcedure
    .meta({ openapi: { method: 'GET', path: '/v1/public/version', summary: 'Update user config', tags: ['Public'] } })
    .input(z.void())
    .output(z.string())
    .query(async function () {
      return await cache.wrap('version', async () => {
        return packageJson.version
      }, { ttl: 60 * 60 * 1000 })
    }),
  latestVersion: publicProcedure
    .meta({ openapi: { method: 'GET', path: '/v1/public/latest-version', summary: 'Get a new version', tags: ['Public'] } })
    .input(z.void())
    .output(z.string())
    .query(async function () {
      return await cache.wrap('latest-version', async () => {
        const url = `https://api.github.com/repos/blinko-space/blinko/releases/latest`;
        try {
          const res = await axios.get(url, {
            headers: {
              'X-GitHub-Api-Version': '2022-11-28',
              'Accept': 'application/vnd.github+json'
            },
          })
          const latestVersion = res.data.tag_name.replace('v', '');
          return latestVersion
        } catch (error) {
          return ''
        }
      }, { ttl: 60 * 10 * 1000 })
    }),
  linkPreview: publicProcedure
    .meta({ openapi: { method: 'GET', path: '/v1/public/link-preview', summary: 'Get a link preview info', tags: ['Public'] } })
    .input(z.object({ url: z.string() }))
    .output(z.union([z.object({
      title: z.string(),
      favicon: z.string(),
      description: z.string()
    }), z.null()]))
    .query(async function ({ input }) {
      return cache.wrap(input.url, async () => {
        try {
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Timeout')), 5000);
          });
          const fetchPromise = limit(async () => {
            const result: Metadata = await unfurl(input.url);
            return {
              title: result?.title ?? '',
              favicon: result?.favicon ?? '',
              description: result?.description ?? ''
            };
          });
          const result: any = await Promise.race([fetchPromise, timeoutPromise]);
          return result;
        } catch (error) {
          console.error('Link preview error:', error);
          return {
            title: '',
            favicon: '',
            description: ''
          };
        }
      }, { ttl: 60 * 60 * 1000 })
    }),
  testWebhook: publicProcedure
    .meta({ openapi: { method: 'POST', path: '/v1/public/test-webhook', summary: 'Test webhook', tags: ['Public'] } })
    .input(z.object({
      data: z.any().optional(),
      webhookType: z.string().optional()
    }))
    .output(z.object({
      success: z.boolean(),
      data: z.any().optional()
    }))
    .query(async function ({ input }) {
      console.log('test webhook', input, input.data?.attachments, input.data?.tags)
      return {
        success: true,
        data: input.data
      }
    })
})