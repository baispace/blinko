import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { FileService } from "@/server/plugins/files";
import { getToken } from "next-auth/jwt";

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

export const POST = async (req: NextRequest, res: NextResponse) => {
  const token = await getToken({ req });
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.getAll('file')[0] as File;
    
    if (!file) {
      return NextResponse.json({ error: "No files received." }, { status: 400 });
    }

    const originalName = file.name.replaceAll(" ", "_");
    const stream = file.stream();
    
    const filePath = await FileService.uploadFileStream(stream, originalName, file.size);

    const response = NextResponse.json({ 
      Message: "Success", 
      status: 200, 
      ...filePath,
      type: file.type,
      size: file.size
    });

    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', '*');

    return response;
    
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
};

