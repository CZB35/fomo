import { NextRequest } from 'next/server'

export const runtime = 'edge'

function makeStream(texts: string[]): ReadableStream {
  const encoder = new TextEncoder()
  let i = 0
  return new ReadableStream({
    pull(controller) {
      if (i >= texts.length) {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
        return
      }
      controller.enqueue(encoder.encode('data: ' + texts[i++] + '\n\n'))
    }
  })
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const round = searchParams.get('round') || '0'

  // In a real implementation, you could pass messages and winner using a POST body or a KV store.
  // Here we mock a short story stream.
  const parts = [
    `第 ${round} 轮的故事开始。`,
    '在链上王国，玩家们接力留下只言片语，',
    '时间的沙漏被反复翻转。',
    '直至最后一人，夺得王冠与奖池。',
    'AI 记录下这段传奇。'
  ]

  return new Response(makeStream(parts) as any, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive'
    }
  })
}
