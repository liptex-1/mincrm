/** Загрузка картинки пользователем: уменьшаем и сжимаем в JPEG, чтобы хранить компактно. */
function load(file: File): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    if (!file.type.startsWith('image/')) return rej(new Error('Выберите файл-картинку (JPG, PNG, WebP)'));
    const url = URL.createObjectURL(file); const im = new Image();
    im.onload = () => { URL.revokeObjectURL(url); res(im); };
    im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Не удалось прочитать картинку')); };
    im.src = url;
  });
}
/** Квадратная аватарка по центру. */
export async function avatarFromFile(file: File, size = 256): Promise<string> {
  const im = await load(file); const s = Math.min(im.naturalWidth, im.naturalHeight);
  const c = document.createElement('canvas'); c.width = c.height = size;
  c.getContext('2d')!.drawImage(im, (im.naturalWidth - s) / 2, (im.naturalHeight - s) / 2, s, s, 0, 0, size, size);
  return c.toDataURL('image/jpeg', 0.85);
}
/** Фон: длинная сторона не больше maxSide. */
export async function backgroundFromFile(file: File, maxSide = 1920): Promise<string> {
  const im = await load(file); const k = Math.min(1, maxSide / Math.max(im.naturalWidth, im.naturalHeight));
  const c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
  c.getContext('2d')!.drawImage(im, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.8);
}
/** Логотип: до 256 px по длинной стороне, PNG (сохраняет прозрачность). */
export async function logoFromFile(file: File, max = 256): Promise<string> {
  const im = await load(file); const k = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
  const c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
  c.getContext('2d')!.drawImage(im, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}
