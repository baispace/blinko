import { NextResponse } from "next/server";
import { FileService } from "@/server/plugins/files";


//attachment_path like /api/file/123.png
export const POST = async (req: Request, res: NextResponse) => {
  try {
    const { attachment_path } = await req.json();
    await FileService.deleteFile(attachment_path);
    return NextResponse.json({ Message: "Success", status: 200 });
  } catch (error) {
    return NextResponse.json({ Message: "Success", status: 200 });
  }
};