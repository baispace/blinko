import { NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { FileService } from "@/server/plugins/utils";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const GET = async (req: Request, { params }: any) => {
  const { s3ClientInstance, config } = await FileService.getS3Client();
  console.log({filename: params.filename});
  try {
    const fullPath = decodeURIComponent(params.filename.join('/'));
    
    const command = new GetObjectCommand({
      Bucket: config.s3Bucket,
      Key: fullPath,
    });
    
    const signedUrl = await getSignedUrl(s3ClientInstance, command, { expiresIn: 3600 });
    return NextResponse.redirect(signedUrl);
  } catch (error) {
    console.error('S3 file access error:', error);
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }
}; 