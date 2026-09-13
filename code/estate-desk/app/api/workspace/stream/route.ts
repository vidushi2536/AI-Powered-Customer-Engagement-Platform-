import { dashboardStats, workspaceInsights } from '@/lib/domain';
import { identity, read } from '@/lib/store';

export async function GET(request: Request) {
  try {
    const id = await identity();
    const encoder = new TextEncoder();
    let interval: ReturnType<typeof setInterval> | undefined;
    let closed = false;
    let sending = false;
    let lastRevision = -1;
    let heartbeat = 0;

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = async () => {
          if (closed || sending) return;
          sending = true;
          try {
            const { state, revision } = await read(id);
            if (revision !== lastRevision) {
              lastRevision = revision;
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    state,
                    stats: dashboardStats(state),
                    insights: workspaceInsights(state),
                  })}\n\n`,
                ),
              );
            } else if (++heartbeat >= 10) {
              heartbeat = 0;
              controller.enqueue(encoder.encode(': keep-alive\n\n'));
            }
          } catch {
            closed = true;
            if (interval) clearInterval(interval);
            controller.close();
          } finally {
            sending = false;
          }
        };

        await send();
        interval = setInterval(() => void send(), 1500);
        request.signal.addEventListener(
          'abort',
          () => {
            closed = true;
            if (interval) clearInterval(interval);
          },
          { once: true },
        );
      },
      cancel() {
        closed = true;
        if (interval) clearInterval(interval);
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Stream unavailable' },
      { status: 401 },
    );
  }
}
