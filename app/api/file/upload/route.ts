import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { FileService } from "@/server/plugins/files";
import { getToken } from "next-auth/jwt";

export const POST = async (req: NextRequest, res: NextResponse) => {
  const token = await getToken({ req });
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // if (process.env.IS_DEMO) {
  //   return NextResponse.json({ error: "In Demo App" }, { status: 401 });
  // }

  try {
    const formData = await req.formData();
    const file = formData.getAll('file')[0] as File;
    
    if (!file) {
      return NextResponse.json({ error: "No files received." }, { status: 400 });
    }

    const originalName = file.name.replaceAll(" ", "_");
    const stream = file.stream();
    
    const filePath = await FileService.uploadFileStream(stream, originalName, file.size);

    return NextResponse.json({ 
      Message: "Success", 
      status: 200, 
      ...filePath,
      type: file.type,
      size: file.size
    });
    
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
};

