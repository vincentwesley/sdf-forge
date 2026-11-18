import { useRef, useState } from 'react';
import { Film, Loader2 } from 'lucide-react';
import { getActiveRenderer } from '../../render/registry';
import { toast, useEditor, store } from '../../state/store';
import { downloadBlob, safeFilename } from '../../workers/meshClient';

const SIZES = [
  { id: 'sm', label: '480 × 480', w: 480, h: 480 },
  { id: 'sq', label: '720 × 720', w: 720, h: 720 },
  { id: 'hd', label: '1280 × 720', w: 1280, h: 720 },
  { id: 'fhd', label: '1920 × 1080', w: 1920, h: 1080 },
];

/** Turntable video: one full orbit, encoded with WebCodecs (MP4/H.264 where available, else WebM). */
export function VideoTab() {
  const [size, setSize] = useState('sq');
  const [seconds, setSeconds] = useState(6);
  const [progress, setProgress] = useState<number | null>(null);
  const title = useEditor((s) => s.doc.title);
  const supported = typeof VideoEncoder !== 'undefined';
  const cancelRef = useRef(false);

  const run = async () => {
    const r = getActiveRenderer();
    if (!r) return;
    setProgress(0);
    cancelRef.current = false;
    try {
      const mb = await import('mediabunny');
      const s = SIZES.find((x) => x.id === size)!;
      const fps = 30;
      const codec = await mb.getFirstEncodableVideoCodec(['avc', 'vp9', 'vp8'], { width: s.w, height: s.h });
      if (!codec) throw new Error('This browser cannot encode video.');
      const mp4 = codec === 'avc';
      const output = new mb.Output({
        format: mp4 ? new mb.Mp4OutputFormat({ fastStart: 'in-memory' }) : new mb.WebMOutputFormat(),
        target: new mb.BufferTarget(),
      });
      const canvas = document.createElement('canvas');
      canvas.width = s.w;
      canvas.height = s.h;
      const ctx = canvas.getContext('2d')!;
      const source = new mb.CanvasSource(canvas, { codec, bitrate: mb.QUALITY_HIGH });
      output.addVideoTrack(source, { frameRate: fps });
      output.setMetadataTags?.({ title, comment: "Made with SDF Forge by Vin's Atelier" });
      await output.start();
      const cam = store.getState().camera;
      const total = seconds * fps;
      for (let i = 0; i < total; i++) {
        if (cancelRef.current) break;
        const gl = r.renderOffline(s.w, s.h, {
          frames: 4,
          camera: { ...cam, yaw: cam.yaw + (i / total) * Math.PI * 2 },
        });
        ctx.drawImage(gl, 0, 0);
        await source.add(i / fps, 1 / fps);
        if (i % 3 === 0) setProgress(i / total);
      }
      r.endOffline();
      if (cancelRef.current) {
        await output.cancel();
        return;
      }
      await output.finalize();
      const buf = (output.target as InstanceType<typeof mb.BufferTarget>).buffer!;
      downloadBlob(
        buf,
        `${safeFilename(title)}-turntable.${mp4 ? 'mp4' : 'webm'}`,
        mp4 ? 'video/mp4' : 'video/webm',
      );
      toast(`Saved ${mp4 ? 'MP4' : 'WebM'} video`, 'success');
    } catch (e) {
      getActiveRenderer()?.endOffline();
      toast(`Video export failed: ${(e as Error).message}`, 'error', 6000);
    } finally {
      setProgress(null);
    }
  };

  return (
    <div>
      {!supported && (
        <p className="note warn" role="status">
          Video export needs WebCodecs, which this browser does not support. Try a recent Chrome, Edge or
          Safari.
        </p>
      )}
      <div className="form-row">
        <span className="label" id="vid-size">
          Size
        </span>
        <div className="segmented" role="radiogroup" aria-labelledby="vid-size">
          {SIZES.map((x) => (
            <button
              key={x.id}
              type="button"
              role="radio"
              aria-checked={size === x.id}
              onClick={() => setSize(x.id)}
            >
              {x.label}
            </button>
          ))}
        </div>
      </div>
      <div className="form-row">
        <span className="label" id="vid-len">
          Length
        </span>
        <div className="segmented" role="radiogroup" aria-labelledby="vid-len">
          {[4, 6, 10].map((x) => (
            <button
              key={x}
              type="button"
              role="radio"
              aria-checked={seconds === x}
              onClick={() => setSeconds(x)}
            >
              {x} s
            </button>
          ))}
        </div>
      </div>
      <p className="muted" style={{ fontSize: 12 }}>
        One full turn around the shape from the current camera angle, 30 frames per second. MP4 where your
        browser can encode it, otherwise WebM.
      </p>
      {progress !== null && (
        <div style={{ margin: '10px 0' }} role="status" aria-live="polite">
          <div className="progress" aria-label="Rendering video">
            <div style={{ width: `${Math.round(progress * 100)}%`, animation: 'none' }} />
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            Rendering frame by frame… {Math.round(progress * 100)}%
          </div>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          className="btn primary"
          onClick={run}
          disabled={!supported || progress !== null}
          data-testid="export-video"
        >
          {progress !== null ? <Loader2 size={15} className="spin" /> : <Film size={15} />} Render video
        </button>
      </div>
    </div>
  );
}
