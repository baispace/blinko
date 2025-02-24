import { NextResponse } from "next/server";
import { FileService } from "@/server/plugins/files";


export const POST = async (req: Request) => {
  try {
    const { attachment_path } = await req.json();
    await FileService.deleteFile(attachment_path);
    return NextResponse.json({ Message: "Success", status: 200 });
  } catch (error) {
    return NextResponse.json({ Message: "Success", status: 200 });
  }
};