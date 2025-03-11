import { generateFeed } from '@/server/routers/helper';
import { NextResponse } from 'next/server';

export async function GET(
  request: Request,
  { params }: { params:any }
) {
  const { searchParams } = new URL(request.url);
  const userId = params.userId;
  const rows = searchParams.get('row') ? parseInt(searchParams.get('row')!) : 20;
  const origin = request.headers.get('origin') || request.headers.get('host') || 'http://localhost:1111';
  const fullOrigin = origin.startsWith('http') ? origin : `http://${origin}`;
  const feed = await generateFeed(Number(userId), fullOrigin, rows);
  return new NextResponse(feed.rss2(), {
    headers: {
      'Content-Type': 'application/rss+xml; charset=UTF-8',
      'Cache-Control': 'public, max-age=10800',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}