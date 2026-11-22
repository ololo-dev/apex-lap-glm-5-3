// In-page screencast for demo mode: captureStream off the WebGL canvas into
// MediaRecorder, and offer the finished webm as a download. Started only with
// ?record=1 — the record script (scripts/record.ts) catches the download.

export interface AutoRecorder {
  /** performance.now() at recorder start: the zero of video time. */
  t0: number
  stop(): void
}

function pickMime(): string {
  const options = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ]
  for (const m of options) {
    if (MediaRecorder.isTypeSupported(m)) return m
  }
  return ''
}

export function startRecorder(canvas: HTMLCanvasElement): AutoRecorder | null {
  if (typeof MediaRecorder === 'undefined' || !canvas.captureStream) return null
  const mime = pickMime()
  try {
    const stream = canvas.captureStream(60)
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 6_000_000 } : undefined)
    const chunks: Blob[] = []
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data)
    }
    rec.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'demo-lap.webm'
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
      stream.getTracks().forEach((t) => t.stop())
    }
    rec.start(250)
    return {
      t0: performance.now(),
      stop: () => {
        if (rec.state !== 'inactive') rec.stop()
      },
    }
  } catch {
    return null
  }
}
