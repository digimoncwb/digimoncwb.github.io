export function tryCardImageFallback(image: HTMLImageElement, code: string): boolean {
    const fallback = `https://aegis-digi.online/assets/card-images/${encodeURIComponent(code)}-Sample.webp`;
    if (image.src === fallback) return false;
    image.src = fallback;
    return true;
}
