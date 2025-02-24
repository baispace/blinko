import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { FileService } from "@/server/plugins/files";
import { getToken } from "@/server/routers/helper";

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

  if (process.env.IS_DEMO) {
    return NextResponse.json({ error: "In Demo App" }, { status: 401 });
  }

  try {
    const body = await req.json();
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
    const filePath = await FileService.uploadFile({
      buffer,
      originalName,
      type: response.headers.get("content-type") || "",
      accountId: Number(token.id)
    });

    const nextResponse = NextResponse.json({
      Message: "Success",
      status: 200,
      ...filePath,
      originalURL: url,
      type: response.headers.get("content-type") || "",
      size: buffer.length
    });
    nextResponse.headers.set('Access-Control-Allow-Origin', '*');
    nextResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    nextResponse.headers.set('Access-Control-Allow-Headers', '*');

    return nextResponse;

  } catch (error) {
    console.error("Error uploading file from URL:", error);
    return NextResponse.json(
      { error: "Failed to upload file from URL" },
      { status: 500 }
    );
  }
};
