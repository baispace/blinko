// app/api/public/rss/[userId]/atom/route.ts
import { prisma } from '@/server/prisma';
import { Feed } from 'feed';
import { NextResponse } from 'next/server';

export async function generateFeed(userId: number, origin: string, rows: number = 20) {
  const notes = await prisma.notes.findMany({
    where: {
      accountId: userId,
      isShare: true,
      sharePassword: ""
    },
    orderBy: { updatedAt: 'desc' },
    take: rows,
    select: {
      content: true,
      updatedAt: true,
      shareEncryptedUrl: true,
      tags: {
        include: { tag: true }
      },
      account: {
        select: {
          name: true
        }
      },
    }
  });

  const feed = new Feed({
    title: "Blinko Public Notes",
    description: "Latest public notes",
    id: origin,
    link: origin,
    copyright: "All rights reserved",
    updated: new Date(),
    image: `${origin}/logo-dark.png`,
    feedLinks: {
      atom: `${origin}/api/rss/${userId}/atom`,
      rss: `${origin}/api/rss/${userId}/rss`
    },
  });

  notes.forEach(note => {
    const title = note.content.split('\n')[0] || 'Untitled';
    feed.addItem({
      title,
      link: `${origin}/share/${note.shareEncryptedUrl}`,
      description: note.content.substring(0, 200) + '...',
      date: note.updatedAt,
      author: [{
        name: note.account!.name
      }],
      category: note.tags.map(i => {
        return {
          name: i.tag.name
        }
      })
    });
  });

  return feed;
}

export async function GET(
  request: Request,
  { params }: { params: { userId: string } }
) {
  const { searchParams } = new URL(request.url);
  const rows = searchParams.get('rows') ? parseInt(searchParams.get('rows')!) : 20;
  const origin = request.headers.get('origin') || request.headers.get('host') || 'http://localhost:1111';
  const fullOrigin = origin.startsWith('http') ? origin : `http://${origin}`;
  const feed = await generateFeed(Number(params.userId), fullOrigin, rows);
  
  return new NextResponse(feed.atom1(), {
    headers: {
      'Content-Type': 'application/atom+xml; charset=UTF-8',
      'Cache-Control': 'public, max-age=10800',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}