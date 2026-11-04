import { isValidOpenUIProgram } from '../../shared/openui-creative-library';
import { isValidIntelligentUIProgram } from './library';

export function intelligentSidePanel(question: string, answer: string): { source: string; library: 'intelligent' | 'openui' } {
  if (isValidIntelligentUIProgram(answer)) return { source: answer, library: 'intelligent' };
  if (isValidOpenUIProgram(answer)) return { source: answer, library: 'openui' };
  const readable = answer.replace(/\uE200cite\uE202.*?\uE201/g, '').trim();
  const current = /(?:目前|当前|现在|现为)[^。；]{0,30}?(-?\d+(?:\.\d+)?)\s*°\s*C\b/i.exec(readable)?.[1];
  const city = /^([\p{Script=Han}A-Za-z]{2,20})今天/u.exec(readable)?.[1] || '';
  if (/天气|气温|weather/i.test(question) && current) {
    const high = /最高(?:约|为)?\s*\*{0,2}(-?\d+(?:\.\d+)?)\s*°\s*C\b/i.exec(readable)?.[1];
    const morning = /清晨([^，。；]{1,15})/u.exec(readable)?.[1]?.replace(/\*+/g, '').trim();
    const afternoon = /午后([^，。；]{1,15})/u.exec(readable)?.[1]?.replace(/\*+/g, '').trim();
    const evening = /晚上([^。；]{1,35})/u.exec(readable)?.[1]?.replace(/\*+/g, '').trim();
    const forecast = [
      morning && `Card([Caption("清晨"), Text(${JSON.stringify(morning)}, "sm")], "soft")`,
      afternoon && `Card([Caption("午后"), Text(${JSON.stringify(afternoon)}, "sm")], "soft")`,
      evening && `Card([Caption("晚上"), Text(${JSON.stringify(evening)}, "sm")], "soft")`,
    ].filter(Boolean);
    const icon = /雾/.test(readable) ? 'cloud-fog' : /雨/.test(readable) ? 'cloud-rain' : /晴/.test(readable) ? 'cloud-sun' : 'cloud';
    const source = `root = Col([Title(${JSON.stringify(city ? `${city}天气` : '今日天气')}, "lg"), Card([Row([Col([Caption("目前气温"), Title(${JSON.stringify(`${current}°C`)}, "3xl")], 1), Spacer(), Icon(${JSON.stringify(icon)}, "xl")], 3)${high ? `, Row([Caption("今日最高"), Spacer(), Text(${JSON.stringify(`${high}°C`)}, "sm")], 2)` : ''}], "soft")${forecast.length ? `, Grid([${forecast.join(', ')}], 3, 140, 3)` : ''}, Text(${JSON.stringify(readable.replace(/\*\*/g, ''))}, "sm", "muted")])`;
    return { source, library: 'intelligent' };
  }
  return { source: `root = Col([Title(${JSON.stringify(question.slice(0, 80) || 'Agent 回复')}, "lg"), Markdown(${JSON.stringify(readable)})])`, library: 'intelligent' };
}
