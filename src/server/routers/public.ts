import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import packageJson from '../../../package.json'
import axios from 'axios'
import { cache } from '@/lib/cache';
import { unfurl } from 'unfurl.js'
import { Metadata } from 'unfurl.js/dist/types';
import pLimit from 'p-limit';
import * as mm from 'music-metadata';
import { TEMP_PATH, UPLOAD_FILE_PATH, TOKEN_PATH } from '@/lib/constant';
import path from 'path';
import { unlinkSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { SpotifyClient } from './helper/spotify';
import { PrismaClient } from '@prisma/client';
import { getGlobalConfig } from './config';

const limit = pLimit(5);
let spotifyClient: SpotifyClient | null = null;
const prisma = new PrismaClient();

if (!existsSync(path.dirname(TOKEN_PATH))) {
  mkdirSync(path.dirname(TOKEN_PATH), { recursive: true });
}

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
    }),
  musicMetadata: publicProcedure
    .meta({
      openapi: { method: 'GET', path: '/v1/public/music-metadata', summary: 'Get music metadata', tags: ['Public'] },
      headers: {
        'Cache-Control': 'public, max-age=86400, immutable',
        'ETag': true,
      }
    })
    .input(z.object({ filePath: z.string() }))
    .output(z.object({
      coverUrl: z.string().optional(),
      trackName: z.string().optional(),
      albumName: z.string().optional(),
      artists: z.array(z.string()).optional()
    }))
    .query(async function ({ input }) {
      let realFilePath = "";
      if (input.filePath.includes('/api/file/')) {
        realFilePath = input.filePath.replace('/api/file', UPLOAD_FILE_PATH);
      } else if (input.filePath.includes('s3file')) {
        const tempFilePath = path.join(TEMP_PATH, `${Date.now()}.mp3`);
        try {
          const response = await fetch(input.filePath);
          if (!response.ok) {
            throw new Error(`get file from s3 error: ${response.statusText}`);
          }

          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          writeFileSync(tempFilePath, buffer);

          realFilePath = tempFilePath;

          setTimeout(() => {
            try {
              unlinkSync(tempFilePath);
            } catch (error) {
              console.error('Failed to clear temp file:', error);
            }
          }, 5000);

        } catch (error) {
          console.error('Failed to download s3 file:', error);
          throw error;
        }
      }

      const metadata = await mm.parseFile(realFilePath);
      const artistName = metadata.common.artist?.trim();
      const trackName = metadata.common.title?.trim();

      // console.log('Parsed music metadata:', {
      //   artistName,
      //   trackName,
      //   allMetadata: metadata.common
      // });

      if (!artistName || !trackName) {
        // console.log('Missing artist or track name');
        return {
          coverUrl: '',
          trackName: '',
          albumName: '',
          artists: [],
        }
      }

      if (!spotifyClient) {
        const config = await getGlobalConfig({ useAdmin: true })
        if(!config.spotifyConsumerKey && !config.spotifyConsumerSecret){
            return {
              coverUrl: '',
              trackName: trackName,
              albumName: metadata.common.album || '',
              artists: [artistName],
            }
        }
        spotifyClient = new SpotifyClient({
          consumer: {
            key: config.spotifyConsumerKey!,
            secret: config.spotifyConsumerSecret!
          }
        });
      }

      try {
        const coverUrl = await spotifyClient.getCoverArt(artistName, trackName);
        // console.log('Retrieved cover URL:', coverUrl);

        return {
          coverUrl,
          trackName: trackName,
          albumName: metadata.common.album || '',
          artists: [artistName],
        };
      } catch (err) {
        console.error('Failed to get music metadata:', err);
        return {
          coverUrl: '',
          trackName: trackName,
          albumName: metadata.common.album || '',
          artists: [artistName],
        };
      }
    })
})