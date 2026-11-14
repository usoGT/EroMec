// Telefon (Capacitor uygulaması ve telefon tarayıcısı) için: dışa aktarılan dosyaları paylaşma,
// yazdırma penceresi olmayan yerde HTML'den PDF üretme, Android geri tuşu.
import { isNativeApp } from '../renderer/lib/auth';

/** Dokunmatik telefon/tablet mi (masaüstü tarayıcıda indirme, telefonda paylaşma kullanılır) */
export const isTouchDevice = () => isNativeApp() || (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);

/** Android geri tuşu: açık pencere varsa kapatır (Esc gibi), yoksa uygulamayı arka plana alır. */
export async function setupNative() {
  if (!isNativeApp()) return;
  const { App } = await import('@capacitor/app');
  await App.addListener('backButton', () => {
    if (document.querySelector('[role="dialog"]')) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    else void App.minimizeApp();
  });
}

function toBase64(data: Uint8Array): string {
  let s = '';
  for (let i = 0; i < data.length; i += 0x8000) s += String.fromCharCode(...data.subarray(i, i + 0x8000));
  return btoa(s);
}

const isCancel = (e: unknown) => /cancel|abort/i.test(`${(e as Error)?.name ?? ''} ${(e as Error)?.message ?? ''}`);

/**
 * Dosyayı kullanıcıya verir: uygulamada paylaşma menüsü (WhatsApp, Drive, e-posta…), telefon tarayıcısında
 * Web Share, olmazsa indirme. Paylaşıldıysa true döner.
 */
export async function shareFile(name: string, data: Uint8Array, type: string): Promise<boolean> {
  if (isNativeApp()) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
    const written = await Filesystem.writeFile({ path: name, data: toBase64(data), directory: Directory.Cache });
    try {
      await Share.share({ title: name, files: [written.uri], dialogTitle: name });
    } catch (e) {
      if (!isCancel(e)) throw e;
    }
    return true;
  }
  const file = new File([data as BlobPart], name, { type });
  if (isTouchDevice() && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return true;
    } catch (e) {
      if (isCancel(e)) return true;
      // izin yoksa (ör. kullanıcı etkileşimi zaman aşımı) indirmeye düşülür
    }
  }
  return false;
}

/**
 * Yazdırılabilir HTML'i (rapor, puantaj, bordro) A4 PDF'e çevirir. Sayfa yönü HTML'deki @page kuralından okunur.
 * Telefonda yazdırma penceresi olmadığı için kullanılır; görüntü tabanlıdır (metin seçilemez).
 */
export async function htmlToPdf(html: string): Promise<Uint8Array> {
  const page = /@page\s*{[^}]*size:\s*(A3|A4)?\s*(landscape|portrait)?/i.exec(html);
  const format = (page?.[1] ?? 'A4').toLowerCase() as 'a3' | 'a4';
  const landscape = (page?.[2] ?? '').toLowerCase() === 'landscape';
  const [short, long] = format === 'a3' ? [1123, 1587] : [794, 1123]; // @96dpi
  const widthPx = landscape ? long : short;
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([import('jspdf'), import('html2canvas')]);

  // html2canvas, overflow:hidden hücreleri rowspan'lı tablolarda yanlış kırpıyor; PDF için kapatılır.
  const fixed = html.replace('</head>', '<style>th,td{overflow:visible!important}</style></head>');
  const frame = document.createElement('iframe');
  frame.style.cssText = `position:fixed;left:-20000px;top:0;width:${widthPx}px;height:400px;border:0;visibility:hidden`;
  document.body.appendChild(frame);
  try {
    await new Promise<void>((resolve) => {
      frame.onload = () => resolve();
      frame.srcdoc = fixed;
    });
    const body = frame.contentDocument!.body;
    const heightPx = Math.max(body.scrollHeight, 50);
    frame.style.height = `${heightPx}px`;
    const canvas = await html2canvas(body, {
      scale: 2, backgroundColor: '#ffffff', logging: false, foreignObjectRendering: true,
      width: widthPx, height: heightPx, windowWidth: widthPx, windowHeight: heightPx,
    });

    const pdf = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'pt', format, compress: true });
    const margin = 18;
    const pageW = pdf.internal.pageSize.getWidth() - margin * 2;
    const pageH = pdf.internal.pageSize.getHeight() - margin * 2;
    const pxPerPt = canvas.width / pageW;
    const sliceH = Math.floor(pageH * pxPerPt);
    for (let y = 0, n = 0; y < canvas.height; y += sliceH, n++) {
      const h = Math.min(sliceH, canvas.height - y);
      const part = document.createElement('canvas');
      part.width = canvas.width;
      part.height = h;
      part.getContext('2d')!.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
      if (n > 0) pdf.addPage();
      pdf.addImage(part.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, pageW, h / pxPerPt);
    }
    return new Uint8Array(pdf.output('arraybuffer'));
  } finally {
    frame.remove();
  }
}
