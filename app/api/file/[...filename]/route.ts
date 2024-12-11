import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { createReadStream, readFileSync } from "fs";
import { stat, readFile } from "fs/promises";
import mime from "mime-types";
import { UPLOAD_FILE_PATH } from "@/lib/constant";
import crypto from "crypto";

const STREAM_THRESHOLD = 5 * 1024 * 1024;
const ONE_YEAR_IN_SECONDS = 31536000;

export const GET = async (req: Request, { params }: any) => {
  const fullPath = decodeURIComponent(params.filename.join('/'));
  const sanitizedPath = fullPath.replace(/^[./\\]+/, '');
  const filePath = path.join(process.cwd(), UPLOAD_FILE_PATH, sanitizedPath);

  try {
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
    const commonHeaders = {
      "Content-Type": contentType,
      "ETag": etag,
      "Cache-Control": `public, max-age=${ONE_YEAR_IN_SECONDS}, immutable`,
      "Content-Disposition": `attachment; filename="${fullPath}"`,
    };

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
  const fileBuffer = readFileSync(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
}