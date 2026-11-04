import { createElement } from 'react';
import { createParser, defineComponent } from '@openuidev/react-lang';
import { openuiLibrary } from '@openuidev/react-ui/genui-lib';
import { Cloud, CloudFog, CloudSun, Sun } from 'lucide-react';
import { z } from 'zod/v4';

const VideoPlayer = defineComponent({
  name: 'VideoPlayer',
  description: 'Play a video generated or uploaded in the current creative.',
  props: z.object({ src: z.string().min(1), title: z.string(), poster: z.string().optional() }),
  component: ({ props }) => createElement('figure', { className: 'openui-creative-video' },
    createElement('video', { src: props.src, poster: props.poster || undefined, controls: true, playsInline: true, preload: 'metadata', 'aria-label': props.title }),
    createElement('figcaption', null, props.title)),
});

const WeatherCard = defineComponent({
  name: 'WeatherCard',
  description: 'A visual weather report grounded in known values. Use empty strings for unavailable forecast fields; do not infer conditions or temperatures.',
  props: z.object({ city: z.string(), current: z.string(), high: z.string(), morning: z.string(), afternoon: z.string(), evening: z.string(), summary: z.string() }),
  component: ({ props }) => {
    const forecast = [
      { label: '清晨', value: props.morning },
      { label: '午后', value: props.afternoon },
      { label: '晚上', value: props.evening },
    ].filter(item => item.value);
    const conditions = `${props.morning} ${props.afternoon} ${props.evening}`;
    const WeatherIcon = /雾/.test(conditions) ? CloudFog : /晴/.test(conditions) && /云/.test(conditions) ? CloudSun : /晴/.test(conditions) ? Sun : Cloud;
    return createElement('section', { className: 'openui-weather-card', 'aria-label': `${props.city || '今日'}天气` },
      createElement('div', { className: 'openui-weather-card__sky' },
        createElement('div', { className: 'openui-weather-card__heading' },
          createElement('div', null,
            createElement('span', { className: 'openui-weather-card__eyebrow' }, '今日天气'),
            createElement('h2', null, props.city || '天气')),
          createElement(WeatherIcon, { size: 58, strokeWidth: 1.4, 'aria-hidden': true })),
        createElement('div', { className: 'openui-weather-card__reading' },
          createElement('div', null,
            createElement('span', { className: 'openui-weather-card__label' }, '目前气温'),
            createElement('strong', null, props.current)),
          props.high && createElement('div', { className: 'openui-weather-card__high' }, createElement('span', null, '今日最高'), createElement('b', null, props.high)))),
      forecast.length > 0 && createElement('div', { className: 'openui-weather-card__forecast' }, forecast.map(item =>
        createElement('div', { className: 'openui-weather-card__period', key: item.label },
          createElement('span', null, item.label), createElement('strong', null, item.value)))),
      props.summary && createElement('p', { className: 'openui-weather-card__summary' }, props.summary));
  },
});

// Extends the complete upstream library; no built-in component is removed or overridden.
export const creativeOpenUILibrary = openuiLibrary.extend!({ components: { add: [VideoPlayer, WeatherCard] } });
const openuiParser = createParser(creativeOpenUILibrary.toJSONSchema());

export function isValidOpenUIProgram(source: string) {
  try {
    const parsed = openuiParser.parse(source);
    return Boolean(parsed.root && !parsed.meta.incomplete && parsed.meta.errors.length === 0);
  } catch { return false; }
}

export function openuiText(text: string) {
  if (isValidOpenUIProgram(text)) return text;
  return `root = Stack([MarkDownRenderer(${JSON.stringify(text)})])`;
}

export function openuiSidePanel(question: string, answer: string) {
  if (isValidOpenUIProgram(answer)) return answer;
  const readable = answer.replace(/\uE200cite\uE202.*?\uE201/g, '').trim();
  const currentTemperature = /(?:目前|当前|现在|现为)[^。；]{0,30}?(-?\d+(?:\.\d+)?)\s*°\s*C\b/i.exec(readable)?.[1];
  const city = /^([\p{Script=Han}A-Za-z]{2,20})今天/u.exec(readable)?.[1];
  if (/天气|气温|weather/i.test(question) && currentTemperature) {
    const high = /最高(?:约|为)?\s*\*{0,2}(-?\d+(?:\.\d+)?)\s*°\s*C\b/i.exec(readable)?.[1];
    const morning = /清晨([^，。；]{1,15})/u.exec(readable)?.[1]?.replace(/\*+/g, '').trim() || '';
    const afternoon = /午后([^，。；]{1,15})/u.exec(readable)?.[1]?.replace(/\*+/g, '').trim() || '';
    const eveningText = /晚上([^，。；]{1,30})/u.exec(readable)?.[1]?.replace(/\*+/g, '').trim() || '';
    const eveningTemperature = /晚上[^。；]{0,50}?(?:降至|约|为)\s*(?:约)?\s*\*{0,2}(-?\d+(?:\.\d+)?)\s*°\s*C\b/i.exec(readable)?.[1];
    const evening = [eveningText, eveningTemperature ? `${eveningTemperature}°C` : ''].filter(Boolean).join(' · ');
    const values = [city || '', `${currentTemperature}°C`, high ? `${high}°C` : '', morning, afternoon, evening, readable.replace(/\*\*/g, '')];
    return `root = WeatherCard(${values.map(value => JSON.stringify(value)).join(', ')})`;
  }
  return `root = Stack([Card([CardHeader(${JSON.stringify(question.slice(0, 60) || 'Agent 回复')}), TextContent(${JSON.stringify(readable)})])])`;
}

export function openuiMedia(kind: 'image' | 'video', url: string, label: string, poster?: string) {
  return kind === 'image'
    ? `root = Stack([ImageGallery([{"src":${JSON.stringify(url)},"alt":${JSON.stringify(label)}}])])`
    : `root = Stack([VideoPlayer(${JSON.stringify(url)}, ${JSON.stringify(label)}, ${JSON.stringify(poster || '')})])`;
}
