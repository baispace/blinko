import { NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { FileService } from "@/server/plugins/files";
import sharp from "sharp";
import mime from "mime-types";

const MAX_PRESIGNED_URL_EXPIRY = 604800 - (60 * 60 * 24);
const CACHE_DURATION = MAX_PRESIGNED_URL_EXPIRY;
const MAX_THUMBNAIL_SIZE = 1024 * 1024; // 1MB

function isImage(filename: string): boolean {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  return imageExtensions.some(ext => filename.toLowerCase().endsWith(ext));
}

async function generateThumbnail(s3ClientInstance: any, config: any, fullPath: string) {
  try {
    const command = new GetObjectCommand({
      Bucket: config.s3Bucket,
      Key: decodeURIComponent(fullPath)
    });

    const response = await s3ClientInstance.send(command);
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as any) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    const metadata = await sharp(buffer).metadata();
    const { width = 0, height = 0 } = metadata;

    let resizeWidth = width;
    let resizeHeight = height;
    const maxDimension = 500;

    if (width > height && width > maxDimension) {
      resizeWidth = maxDimension;
      resizeHeight = Math.round(height * (maxDimension / width));
    } else if (height > maxDimension) {
      resizeHeight = maxDimension;
      resizeWidth = Math.round(width * (maxDimension / height));
    }

    const thumbnail = await sharp(buffer, {
      failOnError: false,
      limitInputPixels: false
    })
      .rotate()
      .resize(resizeWidth, resizeHeight, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
        withoutEnlargement: true
      })
      .toBuffer();

    return thumbnail;
  } catch (error) {
    console.error('Thumbnail generation error:', error);
    throw error;
  }
}

export const GET = async (req: Request, { params }) => {
  const { s3ClientInstance, config } = await FileService.getS3Client();
  try {
    const fullPath = (await params).filename.join('/');
    const url = new URL(req.url);
    const needThumbnail = url.searchParams.get('thumbnail') === 'true';

    if (isImage(fullPath) && needThumbnail) {
      try {
        const thumbnail = await generateThumbnail(s3ClientInstance, config, fullPath);
        const filename = decodeURIComponent(fullPath.split('/').pop() || '');
        return new Response(thumbnail, {
          headers: {
            "Content-Type": mime.lookup(filename) || "image/jpeg",
            "Cache-Control": "public, max-age=31536000",
            "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
            "X-Content-Type-Options": "nosniff",
          }
        });
      } catch (error) {
        console.error('Failed to generate thumbnail, falling back to original:', error);
        const command = new GetObjectCommand({
          Bucket: config.s3Bucket,
          Key: decodeURIComponent(fullPath),
          ResponseCacheControl: `public, max-age=${CACHE_DURATION}, immutable`,
        });

        console.log('Bucket:', config.s3Bucket);
        console.log('Key:', decodeURIComponent(fullPath));

        const signedUrl = await getSignedUrl(s3ClientInstance, command, {
          expiresIn: MAX_PRESIGNED_URL_EXPIRY,
        });

        console.log('Signed URL:', signedUrl);

        return NextResponse.redirect(signedUrl);
      }
    }

    const command = new GetObjectCommand({
      Bucket: config.s3Bucket,
      Key: decodeURIComponent(fullPath),
      ResponseCacheControl: `public, max-age=${CACHE_DURATION}, immutable`,
    });

    const signedUrl = await getSignedUrl(s3ClientInstance, command, {
      expiresIn: MAX_PRESIGNED_URL_EXPIRY,
    });


    return NextResponse.redirect(signedUrl, {
      headers: {
        'Cache-Control': `public, max-age=${CACHE_DURATION}, immutable`,
        'Expires': new Date(Date.now() + CACHE_DURATION * 1000).toUTCString()
      }
    });
  } catch (error) {
    console.error('S3 file access error:', error);
    return NextResponse.json({
      error: 'File not found',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 404 });
  }
};                                                                                                                                                                                            