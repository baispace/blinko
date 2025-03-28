import { NextResponse, NextRequest } from "next/server";
import path from "path";
import { createReadStream, statSync } from "fs";
import { stat, readFile } from "fs/promises";
import mime from "mime-types";
import { UPLOAD_FILE_PATH } from "@/lib/constant";
import crypto from "crypto";
import sharp from "sharp";
import { prisma } from "@/server/prisma";
import { getToken } from "@/server/routers/helper";

const STREAM_THRESHOLD = 5 * 1024 * 1024;
const IMAGE_PROCESSING_TIMEOUT = 30000; 

let activeStreams = 0;

export const GET = async (req: NextRequest, { params }: any) => {
  const fullPath = decodeURIComponent((await params).filename.join('/'));
  const token = await getToken(req);

  const searchParams = req.nextUrl.searchParams;
  const needThumbnail = searchParams.get('thumbnail') === 'true';
  const isDownload = searchParams.get('download') === 'true';

  if (!fullPath.includes('temp/') && !fullPath.endsWith('.bko')) {
    const myFile = await prisma.attachments.findFirst({
      where: {
        path: '/api/file/' + fullPath
      },
      include: {
        note: {
          select: {
            isShare: true,
            accountId: true
          }
        }
      }
    })

    if (myFile && !myFile?.note?.isShare && Number(token?.id) != myFile?.note?.accountId && !myFile?.accountId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }


  if (fullPath.endsWith('.bko') && token?.role !== 'superadmin') {
    return NextResponse.json({ error: "Only superadmin can access" }, { status: 401 });
  }


  const sanitizedPath = fullPath.replace(/^[./\\]+/, '');
  const filePath = path.join(UPLOAD_FILE_PATH, sanitizedPath);

  try {
    if (isImage(fullPath) && needThumbnail) {
      const processingTimeout = setTimeout(() => {
        return NextResponse.json(
          { message: "Image processing timeout" },
          { status: 408 }
        );
      }, IMAGE_PROCESSING_TIMEOUT);
      
      try {
        const thumbnailStream = sharp()
          .rotate()
          .resize(500, 500, {
            fit: 'inside',
            withoutEnlargement: true
          });
        
        createReadStream(filePath).pipe(thumbnailStream);
        
        const thumbnail = await thumbnailStream.toBuffer();

        const filename = path.basename(fullPath);
        const safeFilename = Buffer.from(filename).toString('base64');

        clearTimeout(processingTimeout);
        return new Response(thumbnail, {
          headers: {
            "Content-Type": mime.lookup(filePath) || "image/jpeg",
            "Cache-Control": "public, max-age=31536000",
            "Content-Disposition": `inline; filename="${safeFilename}"`,
          }
        });
      } catch(error) {
        clearTimeout(processingTimeout);
        throw error;
      }
    }

    const stats = await stat(filePath);

    if (!stats.isFile()) {
      return NextResponse.json(
        { message: "Not a valid file" },
        { status: 404 }
      );
    }

    const fileHash = generateFileHash(filePath);
    const etag = `"${fileHash}"`;
    const ifNoneMatch = req.headers.get("if-none-match");
    if (ifNoneMatch === etag) {
      return new Response(null, { status: 304 });
    }

    const contentType = mime.lookup(filePath) || "application/octet-stream";
    const encodedFilename = encodeURIComponent(fullPath).replace(/['()]/g, (char) => '%' + char.charCodeAt(0).toString(16));
    const fallbackFilename = `file${path.extname(fullPath)}`;
    const commonHeaders = {
      "Content-Type": contentType,
      "ETag": etag,
      "Cache-Control": "public, max-age=3600",
    };

    if (isDownload) {
      commonHeaders["Content-Disposition"] = `attachment; filename="${fallbackFilename}"; filename*=UTF-8''${encodedFilename}`;
    }

    const range = req.headers.get("range");

    if (stats.size > STREAM_THRESHOLD) {
      const abortController = new AbortController();
      const { signal } = abortController;
      
      activeStreams++;
      console.log(`[File Stream] Active streams: ${activeStreams}, Path: ${fullPath}`);
      
      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0]!, 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
        const chunksize = (end - start) + 1;

        const stream = createReadStream(filePath, { start, end });
        const readableStream = new ReadableStream({
          start(controller) {
            const timeout = setTimeout(() => {
              stream.destroy();
              controller.error(new Error('Stream timeout'));
              activeStreams--;
            }, 300000); 
            
            stream.on('data', (chunk) => controller.enqueue(chunk));
            
            stream.on('end', () => {
              clearTimeout(timeout);
              controller.close();
              activeStreams--;
            });
            
            stream.on('error', (error) => {
              clearTimeout(timeout);
              console.error(`[File Stream] Stream error: ${error.message}`);
              controller.error(error);
              stream.destroy();
              activeStreams--;
              console.log(`[File Stream] Stream errored. Active streams: ${activeStreams}`);
            });
            
            signal.addEventListener('abort', () => {
              clearTimeout(timeout);
              stream.destroy();
              controller.close();
              activeStreams--;
            });
          },
          cancel() {
            stream.destroy(); 
            activeStreams--;
          }
        });

        req.signal.addEventListener('abort', () => {
          abortController.abort();
        });

        return new Response(readableStream, {
          status: 206,
          headers: {
            ...commonHeaders,
            "Content-Length": chunksize.toString(),
            "Content-Range": `bytes ${start}-${end}/${stats.size}`,
            "Accept-Ranges": "bytes",
          },
        });
      } else {
        const stream = createReadStream(filePath);
        const readableStream = new ReadableStream({
          start(controller) {
            const timeout = setTimeout(() => {
              console.log(`[File Stream] Timeout for ${fullPath}`);
              stream.destroy();
              controller.error(new Error('Stream timeout'));
              activeStreams--;
            }, 300000); 
            
            stream.on('data', (chunk) => controller.enqueue(chunk));
            
            stream.on('end', () => {
              clearTimeout(timeout);
              controller.close();
              activeStreams--;
            });
            
            stream.on('error', (error) => {
              clearTimeout(timeout);
              console.error(`[File Stream] Stream error: ${error.message}`);
              controller.error(error);
              stream.destroy();
              activeStreams--;
            });
            
            signal.addEventListener('abort', () => {
              clearTimeout(timeout);
              console.log(`[File Stream] Connection aborted for ${fullPath}`);
              stream.destroy();
              controller.close();
              activeStreams--;
            });
          },
          cancel() {
            console.log(`[File Stream] Stream cancelled for ${fullPath}`);
            stream.destroy();
            activeStreams--;
          }
        });

        req.signal.addEventListener('abort', () => {
          abortController.abort();
        });

        return new Response(readableStream, {
          headers: {
            ...commonHeaders,
            "Content-Length": stats.size.toString(),
            "Accept-Ranges": "bytes",
          },
        });
      }
    } else {
      const fileContent = await readFile(filePath);
      return new Response(fileContent, {
        headers: {
          ...commonHeaders,
          "Content-Length": stats.size.toString(),
          "Accept-Ranges": "bytes",
        },
      });
    }
  } catch (error: any) {
    console.error('error:', error);
    if (error.code === 'ENOENT') {
      return NextResponse.json(
        { message: "File not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
};

function generateFileHash(filePath: string): string {
  const stats = statSync(filePath);
  const hashContent = `${stats.mtime.getTime()}-${stats.size}`;
  const hashSum = crypto.createHash('sha256');
  hashSum.update(hashContent);
  return hashSum.digest('hex');
}

function isImage(filename: string): boolean {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  return imageExtensions.some(ext => filename.toLowerCase().endsWith(ext));
}