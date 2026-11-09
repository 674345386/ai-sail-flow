export const IMAGE_MODELS = ['gpt-image-2.6-flare', 'gpt-image-2.6-sunburst'] as const;
export const DEFAULT_IMAGE_MODEL = IMAGE_MODELS[0];

// Images API adapter: https://developers.openai.com/api/docs/guides/image-generation#size-and-quality-options
// Keep ratios exact. A third-party gateway may reject a size; never substitute.
export const IMAGE_RATIO_SIZES: Record<string, string> = {
  '1:1': '1024x1024',
  '16:9': '1536x864',
  '9:16': '864x1536',
  '4:5': '1024x1280',
  '3:2': '1536x1024',
  '2:3': '1024x1536',
  '4:3': '1536x1152',
  '3:4': '1152x1536',
};
export const IMAGE_RATIO_PATTERN = /^[1-9]\d{0,4}:[1-9]\d{0,4}$/;
export const IMAGE_SIZE_PATTERN = /^(?:auto|[1-9]\d{0,4}x[1-9]\d{0,4})$/;
export const IMAGE_QUALITIES = ['auto', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
export type ImageQuality = typeof IMAGE_QUALITIES[number];
export type ImageGenerationOptions = { aspectRatio?: string; size?: string; quality?: ImageQuality };
export const IMAGE_SIZE_LIMITS = { multiple: 16, maxEdge: 3840, maxAspectRatio: 3, minPixels: 655360, maxPixels: 8294400, experimentalAbovePixels: 3686400 } as const;

function validateImageSize(size: string) {
  const [width, height] = size.split('x').map(Number);
  const limits = IMAGE_SIZE_LIMITS;
  if (width % limits.multiple || height % limits.multiple) throw new Error(`图片尺寸 ${size} 的宽高必须都是 16 的倍数；不会自动取整。`);
  if (width > limits.maxEdge || height > limits.maxEdge) throw new Error('图片每边不能超过 3840 像素；不会自动缩小。');
  if (Math.max(width, height) > Math.min(width, height) * limits.maxAspectRatio) throw new Error('图片长边与短边之比不能超过 3:1；不会自动改变比例。');
  if (width * height < limits.minPixels || width * height > limits.maxPixels) throw new Error('图片总像素必须在 655360 到 8294400 之间；不会自动缩放。');
}

/** Preserve explicit dimensions and ratios. Unspecified sizing stays unspecified. */
export function imageRequestSize(aspectRatio?: string, size?: string): string {
  if (aspectRatio !== undefined && !IMAGE_RATIO_PATTERN.test(aspectRatio)) throw new Error('图片比例格式应为正整数比例，例如 16:9。');
  if (size !== undefined && !IMAGE_SIZE_PATTERN.test(size)) throw new Error('图片尺寸格式应为宽x高，例如 1536x864。');
  if (size === 'auto') {
    if (aspectRatio !== undefined) throw new Error('指定图片比例时请使用同比例的具体 size，或省略 size；不会用 auto 覆盖明确比例。');
    return 'auto';
  }
  if (size && aspectRatio) {
    const [width, height] = size.split('x').map(Number);
    const [rw, rh] = aspectRatio.split(':').map(Number);
    if (width * rh !== height * rw) throw new Error(`图片尺寸 ${size} 与比例 ${aspectRatio} 不一致；请明确修改其中一个参数，不会自动替换。`);
  }
  if (size) { validateImageSize(size); return size; }
  if (aspectRatio === undefined) return 'auto';
  // Accept equivalent fractions such as 32:18 without changing their meaning.
  const [rw, rh] = aspectRatio.split(':').map(Number);
  const exact = Object.entries(IMAGE_RATIO_SIZES).find(([ratio]) => {
    const [w, h] = ratio.split(':').map(Number);
    return w * rh === h * rw;
  });
  if (!exact) throw new Error(`图片比例 ${aspectRatio} 需要明确提供同比例 size；不会自动替换成其他比例。`);
  validateImageSize(exact[1]);
  return exact[1];
}
