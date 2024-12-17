import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { getToken } from "next-auth/jwt";
import { FileService } from "@/server/plugins/files";

export const POST = async (req: NextRequest, res: NextResponse) => {
  const token = await getToken({ req });
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (process.env.IS_DEMO) {
    return NextResponse.json({ error: "In Demo App" }, { status: 401 });
  }

  try {
    const body = await req.json();
    console.log(body)
    const { url } = body;

    if (!url) {
      return NextResponse.json({ error: "No URL provided" }, { status: 400 });
    }

    const response = await fetch(url);
    if (!response.ok) {
      return NextResponse.json({ error: "Failed to fetch file from URL" }, { status: 400 });
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    const urlPath = new URL(url).pathname;
    const originalName = path.basename(urlPath).replaceAll(" ", "_");
    const extension = path.extname(originalName);
    console.log({ originalName, extension })
    const filePath = await FileService.uploadFile(buffer, originalName);

    return NextResponse.json({
      Message: "Success",
      status: 200,
      ...filePath,
      originalURL: url,
      type: response.headers.get("content-type") || "",
      size: buffer.length
    });

  } catch (error) {
    console.error("Error uploading file from URL:", error);
    return NextResponse.json(
      { error: "Failed to upload file from URL" },
      { status: 500 }
    );
  }
};
