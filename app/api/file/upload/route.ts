import { NextRequest, NextResponse } from "next/server";
import { FileService } from "@/server/plugins/files";
import { getToken } from "@/server/routers/helper";
import { Readable, PassThrough } from "stream";
import * as webStreams from "stream/web";

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Max-Age': '86400',
    },
  });
}

export const POST = async (req: NextRequest) => {
  const token = await getToken(req);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: "Content type must be multipart/form-data" }, { status: 400 });
    }
    
    const busboy = (await import('busboy')).default({ headers: Object.fromEntries(req.headers) });
    
    let fileInfo: { 
      stream: PassThrough | null,
      filename: string,
      mimeType: string,
      size: number
    } | null = null;
    
    return new Promise<Response>((resolve) => {
      busboy.on('file', (fieldname, stream, info) => {
        if (fieldname === 'file') {
          const passThrough = new PassThrough();
          let fileSize = 0;
          const decodedFilename = Buffer.from(info.filename, 'binary').toString('utf-8');
          
          stream.on('data', (chunk) => {
            fileSize += chunk.length;
            passThrough.write(chunk);
          });
          
          stream.on('end', () => {
            passThrough.end();
            fileInfo = {
              stream: passThrough,
              filename: decodedFilename.replaceAll(" ", "_"),
              mimeType: info.mimeType,
              size: fileSize
            };
          });
        }
      });
      
      busboy.on('finish', async () => {
        if (!fileInfo || !fileInfo.stream) {
          resolve(NextResponse.json({ error: "No files received." }, { status: 400 }));
          return;
        }
        
        try {
          const webReadableStream = Readable.toWeb(fileInfo.stream) as unknown as ReadableStream;
          
          const filePath = await FileService.uploadFileStream({
            stream: webReadableStream,
            originalName: fileInfo.filename,
            fileSize: fileInfo.size,
            type: fileInfo.mimeType,
            accountId: Number(token.id)
          });
          
          const response = NextResponse.json({
            Message: "Success",
            status: 200,
            ...filePath,
            type: fileInfo.mimeType,
            size: fileInfo.size
          });
          
          response.headers.set('Access-Control-Allow-Origin', '*');
          response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
          response.headers.set('Access-Control-Allow-Headers', '*');
          
          resolve(response);
        } catch (error) {
          console.error('Upload error:', error);
          resolve(NextResponse.json({ error: "Upload failed" }, { status: 500 }));
        }
      });
      
      if (req.body) {
        const reqBodyStream = Readable.fromWeb(req.body as unknown as webStreams.ReadableStream);
        reqBodyStream.pipe(busboy);
      } else {
        resolve(NextResponse.json({ error: "No request body" }, { status: 400 }));
      }
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
};