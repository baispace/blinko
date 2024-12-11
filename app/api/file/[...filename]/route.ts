import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { createReadStream } from "fs";
import { stat, readFile } from "fs/promises";
import mime from "mime-types";
import { UPLOAD_FILE_PATH } from "@/lib/constant";

const STREAM_THRESHOLD = 5 * 1024 * 1024;

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
    
    const contentType = mime.lookup(filePath) || "application/octet-stream";
    
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
            "Content-Type": contentType,
            "Content-Length": chunksize.toString(),
            "Content-Range": `bytes ${start}-${end}/${stats.size}`,
            "Accept-Ranges": "bytes",
            "Content-Disposition": `attachment; filename="${fullPath}"`,
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
            "Content-Type": contentType,
            "Content-Length": stats.size.toString(),
            "Accept-Ranges": "bytes",
            "Content-Disposition": `attachment; filename="${fullPath}"`,
          },
        });
      }
    } else {
      const fileContent = await readFile(filePath);
      return new Response(fileContent, {
        headers: {
          "Content-Type": contentType,
          "Content-Length": stats.size.toString(),
          "Accept-Ranges": "bytes",
          "Content-Disposition": `attachment; filename="${fullPath}"`,
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