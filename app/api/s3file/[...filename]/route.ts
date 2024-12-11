import { NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { FileService } from "@/server/plugins/files";

const ONE_WEEK_IN_SECONDS = 7 * 24 * 60 * 60;
const CACHE_DURATION = ONE_WEEK_IN_SECONDS;

export const GET = async (req: Request, { params }: any) => {
  const { s3ClientInstance, config } = await FileService.getS3Client();
  try {
    const fullPath = decodeURIComponent(params.filename.join('/'));
    
    const command = new GetObjectCommand({
      Bucket: config.s3Bucket,
      Key: fullPath,
      ResponseCacheControl: `public, max-age=${CACHE_DURATION}, immutable`,
    });
    
    const signedUrl = await getSignedUrl(s3ClientInstance, command, { 
      expiresIn: ONE_WEEK_IN_SECONDS,
    });
    
    return NextResponse.redirect(signedUrl, {
      headers: {
        'Cache-Control': `public, max-age=${CACHE_DURATION}, immutable`,
        'Expires': new Date(Date.now() + CACHE_DURATION * 1000).toUTCString()
      }
    });
  } catch (error) {
    console.error('S3 file access error:', error);
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }
};                                                                                                                                                                                            