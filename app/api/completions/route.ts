import { NextRequest, NextResponse } from 'next/server';
import { createTRPCClient, httpBatchStreamLink } from '@trpc/client';
import { AppRouter } from '@/server/routers/_app';
import superjson from 'superjson';
import { getToken } from '@/server/routers/helper';
import { getGlobalConfig } from '@/server/routers/config';

// Create a streaming server-side TRPC client
const createServerStreamClient = (req: NextRequest) => {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchStreamLink({
        url: `${req.nextUrl.origin}/api/trpc`,
        headers: () => ({
          authorization: req.headers.get('authorization') || '',
        }),
        transformer: superjson
      }),
    ],
  });
};

// Handle preflight requests
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    }
  });
}

export async function POST(request: NextRequest) {
  try {
    // Validate token
    const token = await getToken(request);
    if (!token) {
      return NextResponse.json(
        { error: { message: 'No valid authorization token provided' } },
        { status: 401 }
      );
    }

    // Get user configuration
    const config = await getGlobalConfig({ ctx: token });

    // Determine feature flags based on configuration
    const withRAG = !!config.embeddingModel;
    const withTools = !!config.tavilyApiKey;
    const withOnline = !!config.tavilyApiKey;

    // Parse request body
    const body = await request.json();
    const { messages, stream = false, model } = body;

    // Convert message format
    const conversations = messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    // Get the last user message as the question
    const question = conversations.filter(msg => msg.role === 'user').pop()?.content || '';

    // Create server-side TRPC client
    const trpcClient = createServerStreamClient(request);

    if (stream) {
      // Stream response, compatible with OpenAI format
      const encoder = new TextEncoder();
      const customReadable = new ReadableStream({
        async start(controller) {
          let id = '';
          try {
            id = `chatcmpl-${Math.random().toString(36).substring(2, 12)}`;
            
            // Send start event
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              id,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: model || 'blinko-default',
              choices: [{ delta: { role: 'assistant' }, index: 0, finish_reason: null }]
            })}\n\n`));

            // Call TRPC streaming API
            const res = await trpcClient.ai.completions.mutate({
              question,
              conversations,
              withRAG,
              withTools,
              withOnline
            });

            // Process streaming response
            for await (const item of res as AsyncIterable<any>) {
              if (item.notes) {
                // Process referenced notes and non-text content
              } else if (item.chunk?.type === 'text-delta') {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                  id,
                  object: 'chat.completion.chunk',
                  created: Math.floor(Date.now() / 1000),
                  model: model || 'blinko-default',
                  choices: [{ delta: { content: item.chunk.textDelta }, index: 0, finish_reason: null }]
                })}\n\n`));
              }
            }

            // Send end event
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              id,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: model || 'blinko-default',
              choices: [{ delta: {}, index: 0, finish_reason: 'stop' }]
            })}\n\n`));
            
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          } catch (error) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              error: { message: error.message || 'An error occurred during processing' }
            })}\n\n`));
            controller.close();
          }
        }
      });

      return new NextResponse(customReadable, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*'
        }
      });
    } else {
      // Non-streaming response
      let fullResponse = '';
      const res = await trpcClient.ai.completions.mutate({
        question,
        conversations,
        withRAG,
        withTools,
        withOnline
      });

      // Collect complete response from streaming API
      for await (const item of res as AsyncIterable<any>) {
        if (item.chunk?.type === 'text-delta') {
          fullResponse += item.chunk.textDelta;
        }
      }

      // Return response compatible with OpenAI format
      return NextResponse.json({
        id: `chatcmpl-${Math.random().toString(36).substring(2, 12)}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: model || 'blinko-default',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: fullResponse
            },
            finish_reason: 'stop'
          }
        ],
        usage: {
          prompt_tokens: -1, // We don't actually count tokens
          completion_tokens: -1,
          total_tokens: -1
        }
      }, {
        headers: {
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: { message: error.message || 'Internal server error' } },
      { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } }
    );
  }
} 