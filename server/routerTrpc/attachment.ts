import { router, authProcedure } from '../middleware';
import { z } from 'zod';
import { prisma } from '../prisma';
import { Prisma } from '@prisma/client';
import path from 'path';
import fs from 'fs';
import { TRPCError } from '@trpc/server';
import { getGlobalConfig } from './config';
import { FileService } from '../lib/files';
import { buildStaticCdnBase, buildStaticCdnKeyPrefix } from '@shared/lib/pathConstant';
import { resolveStaticPublicDir } from '../lib/cdnStaticDir';
import { randomUUID } from 'crypto';

/**
 * Only these top-level directories are actually fetched from the CDN (see
 * rewriteCdnRefs in server/index.ts, which rewrites /assets, /fonts, /icons,
 * /locales references). Restricting the upload to them keeps the dialog focused
 * on real static resources and avoids pushing server runtime files if the
 * resolved directory happens to also contain the backend bundle.
 */
const CDN_STATIC_DIRS = ['assets', 'fonts', 'icons', 'locales'];

export interface AttachmentResult {
  id: number | null;
  path: string;
  name: string;
  size: string | null;
  type: string | null;
  isShare: boolean;
  sharePassword: string;
  noteId: number | null;
  sortOrder: number;
  createdAt: Date | null;
  updatedAt: Date | null;
  isFolder: boolean;
  folderName: string | null;
}

const mapAttachmentResult = (item: any): AttachmentResult => ({
  id: item.id,
  path: item.path,
  name: item.name,
  size: item.size?.toString() || null,
  type: item.type,
  isShare: item.isShare,
  sharePassword: item.sharePassword,
  noteId: item.noteId,
  sortOrder: item.sortOrder,
  createdAt: item.createdAt ? new Date(item.createdAt) : null,
  updatedAt: item.updatedAt ? new Date(item.updatedAt) : null,
  isFolder: item.is_folder,
  folderName: item.folder_name
});

export const attachmentsRouter = router({
  createFolder: authProcedure
    .input(z.object({
      folderName: z.string(),
      parentFolder: z.string().optional()
    }))
    .mutation(async ({ input, ctx }) => {
      const { folderName, parentFolder } = input;
      
      // Build the folder path
      const folderPath = parentFolder 
        ? `${parentFolder.split('/').join(',')},${folderName}`
        : folderName;
      
      // Create a placeholder attachment record for the folder
      const placeholder = await prisma.attachments.create({
        data: {
          path: `/api/file/${parentFolder ? `${parentFolder}/` : ''}${folderName}/.folder`,
          name: '.folder',
          size: 0,
          type: 'folder',
          perfixPath: folderPath,
          accountId: Number(ctx.id),
          isShare: false,
          sharePassword: '',
          sortOrder: 0
        }
      });
      
      return {
        success: true,
        folderName,
        folderPath
      };
    }),
  
  list: authProcedure
    .input(z.object({
      page: z.number().default(1),
      size: z.number().default(10),
      searchText: z.string().default('').optional(),
      folder: z.string().optional()
    }))
    .query(async function ({ input, ctx }) {
      const { page, size, searchText, folder } = input;
      const skip = (page - 1) * size;

      if (searchText) {
        const attachments = await prisma.attachments.findMany({
          where: {
            OR: [
              {
                note: {
                  accountId: Number(ctx.id)
                }
              },
              {
                accountId: Number(ctx.id)
              }
            ],
            AND: {
              OR: [
                { name: { contains: searchText, mode: 'insensitive' } },
                { path: { contains: searchText, mode: 'insensitive' } }
              ]
            }
          },
          orderBy: [
            { sortOrder: 'asc' },
            { updatedAt: 'desc' }
          ],
          take: size,
          skip: skip
        });

        return attachments.map(item => ({
          id: item.id,
          path: item.path,
          name: item.name,
          size: item.size?.toString() || null,
          type: item.type,
          isShare: item.isShare,
          sharePassword: item.sharePassword,
          noteId: item.noteId,
          sortOrder: item.sortOrder,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          isFolder: false,
          folderName: null
        }));
      }

      if (folder) {
        const folderPath = folder.split('/').join(',');

        const rawQuery = Prisma.sql`
          WITH combined_items AS (
            SELECT DISTINCT ON (folder_name)
              NULL as id,
              CASE 
                WHEN path LIKE '/api/s3file/%' THEN '/api/s3file/'
                ELSE '/api/file/'
              END || split_part("perfixPath", ',', array_length(string_to_array(${folderPath}, ','), 1) + 1) as path,
              split_part("perfixPath", ',', array_length(string_to_array(${folderPath}, ','), 1) + 1) as name,
              NULL::decimal as size,
              NULL as type,
              false as "isShare",
              '' as "sharePassword",
              NULL as "noteId",
              0 as "sortOrder",
              NULL as "createdAt",
              NULL as "updatedAt",
              true as is_folder,
              split_part("perfixPath", ',', array_length(string_to_array(${folderPath}, ','), 1) + 1) as folder_name
            FROM attachments
            WHERE ("noteId" IN (
              SELECT id FROM notes WHERE "accountId" = ${Number(ctx.id)}
            ) OR "accountId" = ${Number(ctx.id)})
              AND "perfixPath" LIKE ${`${folderPath},%`}
              AND array_length(string_to_array("perfixPath", ','), 1) > array_length(string_to_array(${folderPath}, ','), 1)
            
            UNION ALL
            
            SELECT 
              id,
              path,
              name,
              size,
              type,
              "isShare",
              "sharePassword",
              "noteId",
              "sortOrder",
              "createdAt",
              "updatedAt",
              false as is_folder,
              NULL as folder_name
            FROM attachments
            WHERE ("noteId" IN (
              SELECT id FROM notes WHERE "accountId" = ${Number(ctx.id)}
            ) OR "accountId" = ${Number(ctx.id)})
              AND "perfixPath" = ${folderPath}
          )
          SELECT *
          FROM combined_items
          ORDER BY is_folder DESC, "sortOrder" ASC, "updatedAt" DESC NULLS LAST
          LIMIT ${size}
          OFFSET ${skip};
        `;

        const results = await prisma.$queryRaw<any[]>(rawQuery);
        return results.map(mapAttachmentResult);
      }

      const rawQuery = Prisma.sql`
        WITH combined_items AS (
          SELECT DISTINCT ON (folder_name)
            NULL as id,
            CASE 
              WHEN path LIKE '/api/s3file/%' THEN '/api/s3file/'
              ELSE '/api/file/'
            END || split_part("perfixPath", ',', 1) as path,
            split_part("perfixPath", ',', 1) as name,
            NULL::decimal as size,
            NULL as type,
            false as "isShare",
            '' as "sharePassword",
            NULL as "noteId",
            0 as "sortOrder",
            NULL as "createdAt",
            NULL as "updatedAt",
            true as is_folder,
            split_part("perfixPath", ',', 1) as folder_name
          FROM attachments
          WHERE ("noteId" IN (
            SELECT id FROM notes WHERE "accountId" = ${Number(ctx.id)}
          ) OR "accountId" = ${Number(ctx.id)})
            AND "perfixPath" != ''
            AND LOWER("perfixPath") LIKE ${`%${searchText?.toLowerCase() || ''}%`}
          
          UNION ALL
          
          SELECT 
            id,
            path,
            name,
            size,
            type,
            "isShare",
            "sharePassword",
            "noteId",
            "sortOrder",
            "createdAt",
            "updatedAt",
            false as is_folder,
            NULL as folder_name
          FROM attachments
          WHERE ("noteId" IN (
            SELECT id FROM notes WHERE "accountId" = ${Number(ctx.id)}
          ) OR "accountId" = ${Number(ctx.id)})
            AND depth = 0
            AND LOWER(path) LIKE ${`%${searchText?.toLowerCase() || ''}%`}
        )
        SELECT *
        FROM combined_items
        ORDER BY is_folder DESC, "sortOrder" ASC, "updatedAt" DESC NULLS LAST
        LIMIT ${size}
        OFFSET ${skip};
      `;

      const results = await prisma.$queryRaw<any[]>(rawQuery);
      return results.map(mapAttachmentResult);
    }),

  rename: authProcedure
    .input(z.object({
      id: z.number().optional(),
      newName: z.string(),
      isFolder: z.boolean().optional(),
      oldFolderPath: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { id, newName, isFolder, oldFolderPath } = input;

      if (!isFolder && (newName.includes('/') || newName.includes('\\'))) {
        throw new Error('File names cannot contain path separators');
      }

      return await prisma.$transaction(async (tx) => {
        if (isFolder && oldFolderPath) {
          const attachments = await tx.attachments.findMany({
            where: {
              OR: [
                {
                  note: {
                    accountId: Number(ctx.id)
                  },
                },
                {
                  accountId: Number(ctx.id)
                }
              ],
              perfixPath: {
                startsWith: oldFolderPath
              }
            }
          });

          try {
            for (const attachment of attachments) {
              const newPerfixPath = attachment.perfixPath?.replace(oldFolderPath, newName);
              const oldPath = attachment.path;
              const isS3File = oldPath.startsWith('/api/s3file/');
              const baseUrl = isS3File ? '/api/s3file/' : '/api/file/';

              const newPath = attachment.path.replace(
                `${baseUrl}${oldFolderPath.split(',').join('/')}`,
                `${baseUrl}${newName.split(',').join('/')}`
              );

              await FileService.moveFile(oldPath, newPath);

              await tx.attachments.update({
                where: { id: attachment.id },
                data: {
                  perfixPath: newPerfixPath,
                  path: newPath,
                  depth: newPerfixPath?.split(',').length
                }
              });
            }
            return { success: true };
          } catch (error) {
            throw new Error(`Failed to rename folder: ${error.message}`);
          }
        }

        const attachment = await tx.attachments.findFirst({
          where: {
            id,
            note: {
              accountId: Number(ctx.id)
            }
          }
        });

        if (!attachment) {
          throw new Error('Attachment not found');
        }

        try {
          await FileService.renameFile(attachment.path, input.newName);
          return await tx.attachments.update({
            where: { id: input.id },
            data: {
              name: input.newName,
              path: attachment.path.replace(attachment.name, input.newName)
            }
          });
        } catch (error) {
          throw new Error(`Failed to rename file: ${error.message}`);
        }
      });
    }),

  move: authProcedure
    .input(z.object({
      sourceIds: z.array(z.number()),
      targetFolder: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { sourceIds, targetFolder } = input;

      return await prisma.$transaction(async (tx) => {
        const attachments = await tx.attachments.findMany({
          where: {
            id: { in: sourceIds },
            note: {
              accountId: Number(ctx.id)
            }
          }
        });

        if (attachments.length === 0) {
          throw new Error('Attachments not found');
        }

        try {
          for (const attachment of attachments) {
            const newPerfixPath = targetFolder;
            const oldPath = attachment.path;
            const isS3File = oldPath.startsWith('/api/s3file/');
            const baseUrl = isS3File ? '/api/s3file/' : '/api/file/';

            const newPath = targetFolder 
              ? `${baseUrl}${targetFolder.split(',').join('/')}/${attachment.name}`
              : `${baseUrl}${attachment.name}`;

            await FileService.moveFile(oldPath, newPath);

            await tx.attachments.update({
              where: { id: attachment.id },
              data: {
                perfixPath: newPerfixPath,
                depth: newPerfixPath ? newPerfixPath.split(',').length : 0,
                path: newPath
              }
            });
          }
          
          return {
            success: true,
            message: 'Files moved successfully'
          };
        } catch (error) {
          console.error('Move file error:', error);
          throw new Error(`Failed to move files: ${error.message}`);
        }
      });
    }),

  delete: authProcedure
    .input(z.object({
      id: z.union([z.number(),z.null()]).optional(),
      isFolder: z.boolean().optional(),
      folderPath: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { id, isFolder, folderPath } = input;

      return await prisma.$transaction(async (tx) => {
        if (isFolder && folderPath) {
          const attachments = await tx.attachments.findMany({
            where: {
              note: {
                accountId: Number(ctx.id)
              },
              perfixPath: {
                startsWith: folderPath
              }
            }
          });

          if (attachments.length === 0) {
            return { success: true, message: 'Folder deleted successfully' };
          }

          try {
            for (const attachment of attachments) {
              await FileService.deleteFile(attachment.path);
            }
            return { success: true, message: 'Folder and its contents deleted successfully' };
          } catch (error) {
            throw new Error(`Failed to delete folder: ${error.message}`);
          }
        }

        const attachment = await tx.attachments.findFirst({
          where: {
            id: id!,
            OR: [
              {
                note: {
                  accountId: Number(ctx.id)
                }
              },
              {
                accountId: Number(ctx.id)
              }
            ]
          }
        });

        if (!attachment) {
          throw new Error('Attachment not found or you do not have permission to delete it');
        }

        try {
          await FileService.deleteFile(attachment.path);
          return {
            success: true,
            message: 'File deleted successfully'
          };
        } catch (error) {
          throw new Error(`Failed to delete file: ${error.message}`);
        }
      });
    }),
    deleteMany: authProcedure
    .input(z.object({
      ids: z.array(z.number()),
    }))
    .mutation(async ({ input, ctx }) => {
      const { ids } = input;
      // Security fix: Only allow deleting attachments owned by the user
      const attachments = await prisma.attachments.findMany({
        where: {
          id: { in: ids },
          OR: [
            {
              note: {
                accountId: Number(ctx.id)
              }
            },
            {
              accountId: Number(ctx.id)
            }
          ]
        }
      });

      // Delete each file from storage (FileService.deleteFile also removes the DB record)
      for (const attachment of attachments) {
        try {
          await FileService.deleteFile(attachment.path);
        } catch (error) {
          console.error(`Failed to delete file ${attachment.path}:`, error);
        }
      }

      return { success: true, message: 'Files deleted successfully' };
    }),

  /**
   * List the site's built static assets (dist/public -> server/public) so the
   * upload dialog can present a file checklist. Returns relative paths (matching
   * the publicPath layout) plus each file's size and the resolved CDN base URL.
   */
  listStaticAssets: authProcedure
    .query(async () => {
      const config = await getGlobalConfig({ useAdmin: true });
      const base = buildStaticCdnBase(config.staticCdnBaseUrl, config.staticCdnPath);
      const publicPath = resolveStaticPublicDir();
      const files: { path: string; size: number }[] = [];
      if (publicPath && fs.existsSync(publicPath)) {
        const walk = async (dir: string, rel: string) => {
          const entries = await fs.promises.readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            const full = path.join(dir, entry.name);
            const r = rel ? `${rel}/${entry.name}` : entry.name;
            if (entry.isDirectory()) {
              // At the top level, only descend into CDN-relevant directories.
              if (rel === '' && !CDN_STATIC_DIRS.includes(entry.name)) continue;
              await walk(full, r);
            } else {
              // Skip stray files at the top level (index.html, favicon, etc. stay on origin).
              if (rel === '' && !CDN_STATIC_DIRS.includes(entry.name)) continue;
              let size = 0;
              try { size = (await fs.promises.stat(full)).size; } catch { /* ignore */ }
              files.push({ path: r, size });
            }
          }
        };
        await walk(publicPath, '');
      }
      return { files, baseUrl: base };
    }),

  /**
   * Push selected static assets (server/public) to the configured object storage
   * under the CDN base URL's path prefix. Keys mirror the original publicPath
   * layout so HTML references (rewritten by the cdnStaticRewrite middleware) resolve
   * to the CDN domain. The OSS path prefix is fixed to the saved `staticCdnPath`
   * config so upload keys and browser URLs stay aligned — the dialog cannot override it.
   *
   * The upload runs as a background job so the UI can poll progress (the S3 puts
   * are sequential and can take a while for a few hundred files). This mutation
   * only kicks off the job and returns its id; use `staticCdnUploadProgress`.
   * Failures are counted, not fatal. On a successful (uploaded > 0) run we also
   * auto-enable `staticCdnEnabled` so the CDN rewrite actually takes effect —
   * previously uploading alone left the switch off, which is why the site kept
   * serving assets from the origin even after a successful push.
   */
  startStaticCdnUpload: authProcedure
    .input(z.object({ files: z.array(z.string()) }))
    .mutation(async ({ input }) => {
      const jobId = randomUUID();
      const job: StaticCdnJob = {
        total: input.files.length, done: 0, failed: 0, skipped: 0,
        current: '', finished: false, error: undefined,
      };
      staticCdnJobs.set(jobId, job);
      // Fire-and-forget: report progress via the query endpoint.
      void runStaticCdnUpload(job, input.files);
      return { jobId };
    }),

  /**
   * Poll the progress of a static-CDN upload job started by `startStaticCdnUpload`.
   */
  staticCdnUploadProgress: authProcedure
    .input(z.object({ jobId: z.string() }))
    .query(async ({ input }) => {
      const job = staticCdnJobs.get(input.jobId);
      if (!job) {
        return { notFound: true, finished: true, total: 0, done: 0, failed: 0, skipped: 0, current: '', error: undefined };
      }
      return { notFound: false, ...job };
    }),
});

interface StaticCdnJob {
  total: number;
  done: number;        // successfully uploaded
  failed: number;
  skipped: number;
  current: string;     // file being uploaded right now
  finished: boolean;
  error?: string;
}

// In-memory registry of running upload jobs. Single-process (admin-only) feature,
// so a plain Map is sufficient; jobs are short-lived and not persisted.
const staticCdnJobs = new Map<string, StaticCdnJob>();

async function runStaticCdnUpload(job: StaticCdnJob, files: string[]) {
  try {
    const config = await getGlobalConfig({ useAdmin: true });
    if (config.objectStorage !== 's3') {
      job.error = '请先在「对象存储」中启用 S3 并配置好 AccessKey / Bucket';
      job.finished = true;
      return;
    }
    const base = buildStaticCdnBase(config.staticCdnBaseUrl, config.staticCdnPath);
    if (!base) {
      job.error = '请先在「静态资源 CDN」配置 CDN 域名 (staticCdnBaseUrl)';
      job.finished = true;
      return;
    }
    // OSS key prefix is fixed to the saved default path (staticCdnPath). The HTML
    // rewrite middleware uses the same value, so upload keys and browser URLs stay aligned.
    const keyPrefix = buildStaticCdnKeyPrefix(config.staticCdnPath ?? '');

    const publicPath = resolveStaticPublicDir();
    if (!publicPath) {
      job.error = `未找到静态资源构建目录（server/public）。请确认已在生产 / 构建环境执行；当前工作目录：${process.cwd()}`;
      job.finished = true;
      return;
    }

    // Build a fast set of the actually-present files (filter input against disk).
    const allowed = new Set(files);
    const present = new Set<string>();
    const collect = async (dir: string, rel: string) => {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        const r = rel ? `${rel}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          if (rel === '' && !CDN_STATIC_DIRS.includes(entry.name)) continue;
          await collect(full, r);
        } else {
          if (rel === '' && !CDN_STATIC_DIRS.includes(entry.name)) continue;
          if (allowed.has(r)) present.add(r);
        }
      }
    };
    await collect(publicPath, '');
    const toUpload = [...present];

    for (const r of toUpload) {
      job.current = r;
      const full = path.join(publicPath, r);
      try {
        const body = await fs.promises.readFile(full);
        await FileService.uploadBufferToS3(keyPrefix + r, body);
        job.done++;
      } catch (err: any) {
        job.failed++;
        console.error(`[staticCdn] upload failed: ${keyPrefix}${r}`, err);
      }
    }
    job.skipped = allowed.size - present.size;
    job.current = '';

    // Auto-enable the CDN switch on a successful push so the rewrite takes effect.
    // `config.key` is NOT unique in the schema, so we find-by-key then update by id
    // (mirrors the config.update router) rather than upserting on `key`.
    if (job.done > 0 && config.staticCdnEnabled !== true && config.staticCdnEnabled !== 'true') {
      try {
        const existing = await prisma.config.findFirst({ where: { key: 'staticCdnEnabled' } });
        if (existing) {
          await prisma.config.update({ where: { id: existing.id }, data: { config: { type: 'boolean', value: true } } });
        } else {
          await prisma.config.create({ data: { key: 'staticCdnEnabled', config: { type: 'boolean', value: true } } });
        }
        console.log('[staticCdn] auto-enabled staticCdnEnabled after successful upload');
      } catch (err) {
        console.error('[staticCdn] failed to auto-enable staticCdnEnabled', err);
      }
    }
  } catch (err: any) {
    job.error = err?.message ?? String(err);
  } finally {
    job.finished = true;
  }
}
