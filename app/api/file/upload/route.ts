import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { FileService } from "@/server/plugins/files";


export const POST = async (req: Request, res: NextResponse) => {
  const formData = await req.formData();
  const file = formData.getAll('file')[0]
  if (!file) {
    return NextResponse.json({ error: "No files received." }, { status: 400 });
  }
  if (process.env.IS_DEMO) {
    return NextResponse.json({ error: "In Demo App" }, { status: 401 });
  }
  //@ts-ignore
  const buffer = Buffer.from(await file.arrayBuffer());
  //@ts-ignore
  const originalName = (file.name).replaceAll(" ", "_");
  const extension = path.extname(originalName);
  const filePath = await FileService.uploadFile(buffer, originalName)
  //@ts-ignore
  return NextResponse.json({ Message: "Success", status: 200, ...filePath, type: file?.type ?? '', size: file?.size ?? 0 });
};
