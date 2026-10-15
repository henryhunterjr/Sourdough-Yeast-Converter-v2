/**
 * Turn what the baker hands us (photo, screenshot, PDF) into reader input.
 * Photos are downscaled in the browser so uploads stay small. PDFs with real
 * text become text (full guardrails apply); scanned PDFs become page images.
 */
export interface ImageInput { data: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'; preview: string; name: string }
export type Prepared = { text?: string; images?: ImageInput[]; document?: { name: string; pages: number; mode: 'text' | 'images' } };

const MAX_EDGE = 1800;
const JPEG_Q = 0.85;

export async function prepareFile(file: File): Promise<Prepared> {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return preparePdf(file);
  if (file.type.startsWith('image/')) return { images: [await prepareImage(file)] };
  throw new Error(`Unsupported file: ${file.name}`);
}

export async function prepareImage(file: File | Blob, name = 'photo'): Promise<ImageInput> {
  const bitmap = await loadBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  if ('close' in bitmap) (bitmap as ImageBitmap).close();
  const dataUrl = canvas.toDataURL('image/jpeg', JPEG_Q);
  return { data: dataUrl.split(',')[1]!, mediaType: 'image/jpeg', preview: dataUrl, name };
}

async function loadBitmap(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions); } catch { /* fall through */ }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; });
  } finally { URL.revokeObjectURL(url); }
}

async function preparePdf(file: File): Promise<Prepared> {
  const pdfjs = await import('pdfjs-dist');
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() });
  const doc = await loadingTask.promise;
  if (doc.numPages > 12) { await loadingTask.destroy(); throw new Error('This PDF has more than 12 pages. Split it or upload the recipe print version. No pages were imported.'); }
  const pages = doc.numPages;
  try {

  // 1) Real text layer?
  const lines: string[] = [];
  const pageTextLengths: number[] = [];
  for (let p = 1; p <= pages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    pageTextLengths.push(content.items.reduce((n, item) => n + ('str' in item ? item.str.trim().length : 0), 0));
    let lastY: number | null = null, line = '';
    for (const item of content.items as Array<{ str: string; transform: number[]; hasEOL?: boolean }>) {
      const y = Math.round(item.transform[5]!);
      if (lastY !== null && Math.abs(y - lastY) > 2 && line.trim()) { lines.push(line.trim()); line = ''; }
      line += (line && !line.endsWith(' ') ? ' ' : '') + item.str;
      if (item.hasEOL && line.trim()) { lines.push(line.trim()); line = ''; }
      lastY = y;
    }
    if (line.trim()) lines.push(line.trim());
    lines.push('');
  }
  const text = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  const withNumbers = text.split('\n').filter(l => /\d/.test(l)).length;
  if (withNumbers >= 3 && pageTextLengths.every(n => n >= 40)) return { text, document: { name: file.name, pages, mode: 'text' } };

  // 2) Scanned or mixed text/image document: send every page, never truncate.
  const images: ImageInput[] = [];
  for (let p = 1; p <= pages; p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const scale = Math.min(2, MAX_EDGE / Math.max(vp.width, vp.height));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width); canvas.height = Math.round(viewport.height);
    await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport } as any).promise;
    const dataUrl = canvas.toDataURL('image/jpeg', JPEG_Q);
    images.push({ data: dataUrl.split(',')[1]!, mediaType: 'image/jpeg', preview: dataUrl, name: `${file.name} p${p}` });
  }
  return { images, document: { name: file.name, pages, mode: 'images' } };
  } finally { await loadingTask.destroy(); }
}
