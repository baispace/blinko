import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getGlobalConfig } from "../routers/config";
import { THUMBNAIL_PATH, UPLOAD_FILE_PATH } from "@/lib/constant";
import fs, { unlink,  writeFile } from 'fs/promises';
import path from 'path';
import { cache } from "@/lib/cache";
import { prisma } from "../prisma";

export class FileService {
  public static async getS3Client() {
    const config = await getGlobalConfig({ useAdmin: true });
    return cache.wrap(`${config.s3Endpoint}-${config.s3Region}-${config.s3Bucket}-${config.s3AccessKeyId}-${config.s3AccessKeySecret}`, async () => {
      const s3ClientInstance = new S3Client({
        endpoint: config.s3Endpoint,
        region: config.s3Region,
        credentials: {
          accessKeyId: config.s3AccessKeyId,
          secretAccessKey: config.s3AccessKeySecret,
        },
        forcePathStyle: true,
      });
      return { s3ClientInstance, config };
    }, { ttl: 60 * 60 * 86400 * 1000 })
  }

  private static async writeFileSafe(baseName: string, extension: string, buffer: Buffer, attempt: number = 0) {
    const MAX_ATTEMPTS = 20;

    if (attempt >= MAX_ATTEMPTS) {
      throw new Error('MAX_ATTEMPTS_REACHED');
    }

    let filename = attempt === 0 ?
      `${baseName}${extension}` :
      `${baseName}_${attempt}${extension}`;

    try {
      const filePath = path.join(process.cwd(), `${UPLOAD_FILE_PATH}/` + filename);
      await fs.access(filePath);
      //@ts-ignore
      return this.writeFileSafe(baseName, extension, buffer, attempt + 1);
    } catch (error) {
      const filePath = path.join(process.cwd(), `${UPLOAD_FILE_PATH}/` + filename);
      //@ts-ignore
      await writeFile(filePath, buffer);
      return filename;
    }
  }

  static async uploadFile(buffer: Buffer, originalName: string) {
    const extension = path.extname(originalName);
    const baseName = path.basename(originalName, extension);
    const timestamp = Date.now();
    const config = await getGlobalConfig({ useAdmin: true });

    if (config.objectStorage === 's3') {
      const { s3ClientInstance } = await this.getS3Client();

      let customPath = config.s3CustomPath || '';
      if (customPath) {
        customPath = customPath.startsWith('/') ? customPath : '/' + customPath;
        customPath = customPath.endsWith('/') ? customPath : customPath + '/';
      }

      const timestampedFileName = `${baseName}_${timestamp}${extension}`;
      const s3Key = `${customPath}${timestampedFileName}`.replace(/^\//, '');

      const command = new PutObjectCommand({
        Bucket: config.s3Bucket,
        Key: s3Key,
        Body: buffer,
      });

      await s3ClientInstance.send(command);
      const s3Url = `/api/s3file/${s3Key}`;
      return { filePath: s3Url, fileName: timestampedFileName };
    } else {
      const filename = await this.writeFileSafe(baseName, extension, buffer);
      return { filePath: `/api/file/${filename}`, fileName: filename };
    }
  }

  static async deleteFile(api_attachment_path: string) {
    const config = await getGlobalConfig({ useAdmin: true });
    if (api_attachment_path.includes('/api/s3file/')) {
      const { s3ClientInstance } = await this.getS3Client();
      const fileName = api_attachment_path.replace('/api/s3file/', "");
      const command = new DeleteObjectCommand({
        Bucket: config.s3Bucket,
        Key: fileName,
      });
      await s3ClientInstance.send(command);
      const attachmentPath = await prisma.attachments.findFirst({ where: { path: api_attachment_path } })
      if (attachmentPath) {
        await prisma.attachments.delete({ where: { id: attachmentPath.id } })
      }
    } else {
      const filepath = path.join(process.cwd(), `${UPLOAD_FILE_PATH}/` + api_attachment_path.replace('/api/file/', ""));
      const attachmentPath = await prisma.attachments.findFirst({ where: { path: api_attachment_path } })
      if (attachmentPath) {
        await prisma.attachments.delete({ where: { id: attachmentPath.id } })
      }
      if ('jpeg/jpg/png/bmp/tiff/tif/webp/svg'.includes(api_attachment_path.split('.')[1]?.replace('.', '')?.toLowerCase() ?? '')) {
        try {
          await unlink(path.join(process.cwd(), THUMBNAIL_PATH + '/' + api_attachment_path.replace('/api/file/', "")));
        } catch (error) {
        }
      }
      await unlink(filepath);
    }
  }

  static async getFile(filePath: string) {
    const config = await getGlobalConfig({ useAdmin: true });
    const fileName = filePath.replace('/api/file/', '').replace('/api/s3file/', '');
    const tempPath = path.join(UPLOAD_FILE_PATH, path.basename(fileName));

    if (config.objectStorage === 's3') {
      const { s3ClientInstance } = await this.getS3Client();
      const command = new GetObjectCommand({
        Bucket: config.s3Bucket,
        Key: fileName,
      });

      const response = await s3ClientInstance.send(command);
      const chunks: any[] = [];
      for await (const chunk of response.Body as any) {
        chunks.push(chunk);
      }
      //@ts-ignore
      await fs.writeFile(tempPath, Buffer.concat(chunks));
      return tempPath;
    } else {
      return path.join(UPLOAD_FILE_PATH, fileName);
    }
  }
}

