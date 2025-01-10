import { NextResponse, NextRequest } from "next/server";
import path from "path";
import { createReadStream, statSync } from "fs";
import { stat, readFile } from "fs/promises";
import mime from "mime-types";
import { UPLOAD_FILE_PATH } from "@/lib/constant";
import crypto from "crypto";
import { getToken } from "next-auth/jwt";
import sharp from "sharp";
import { prisma } from "@/server/prisma";

const STREAM_THRESHOLD = 5 * 1024 * 1024;
const ONE_YEAR_IN_SECONDS = 31536000;

export const GET = async (req: NextRequest, { params }: any) => {
  const fullPath = decodeURIComponent(params.filename.join('/'));
  const token = await getToken({ req });

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
      const imageBuffer = await readFile(filePath);
      const thumbnail = await sharp(imageBuffer)
        .rotate()
        .resize(500, 500, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .toBuffer();

      const filename = path.basename(fullPath);
      const safeFilename = Buffer.from(filename).toString('base64');

      return new Response(thumbnail, {
        headers: {
          "Content-Type": mime.lookup(filePath) || "image/jpeg",
          "Cache-Control": "public, max-age=31536000",
          "Content-Disposition": `inline; filename="${safeFilename}"`,
        }
      });
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
    console.log({ etag })
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
      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0]!, 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
        const chunksize = (end - start) + 1;

        const stream = createReadStream(filePath, { start, end });
        const readableStream = new ReadableStream({
          start(controller) {
            stream.on('data', (chunk) => controller.enqueue(chunk));
            stream.on('end', () => controller.close());
            stream.on('error', (error) => controller.error(error));
          },
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
            stream.on('data', (chunk) => controller.enqueue(chunk));
            stream.on('end', () => controller.close());
            stream.on('error', (error) => controller.error(error));
          },
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