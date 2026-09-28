export type NarrationInput = { shotId: string; text: string; preferredStart: number; sourceDuration: number };
export type NarrationSegment = NarrationInput & { start: number; end: number; speed: number };

// Speech follows one continuous timeline, not individual visual cut lengths.
// Keep preferred starts where possible, borrowing idle time before/after cuts.
export function planNarrationTiming(inputs: NarrationInput[], targetDuration: number) {
  const pause = 0.08;
  const tail = inputs.length ? 0.08 : 0;
  const pauses = Math.max(0, inputs.length - 1) * pause;
  const spokenDuration = inputs.reduce((sum, input) => sum + input.sourceDuration, 0);
  const speed = Math.min(1.15, Math.max(1, spokenDuration / Math.max(0.01, targetDuration - pauses - tail)));
  const exactDuration = spokenDuration / speed + pauses + tail;
  const requiredDuration = Math.ceil(exactDuration * 100) / 100;
  const needsExtension = exactDuration > targetDuration + 0.001;
  const duration = needsExtension ? requiredDuration : targetDuration;
  const latestStarts: number[] = [];
  let latestEnd = duration - tail;
  for (let index = inputs.length - 1; index >= 0; index--) {
    latestStarts[index] = latestEnd - inputs[index].sourceDuration / speed;
    latestEnd = latestStarts[index] - pause;
  }
  let cursor = 0;
  const segments: NarrationSegment[] = inputs.map((input, index) => {
    const start = Math.max(cursor, Math.min(input.preferredStart, latestStarts[index]));
    const end = start + input.sourceDuration / speed;
    cursor = end + pause;
    return { shotId: input.shotId, text: input.text, preferredStart: input.preferredStart, sourceDuration: input.sourceDuration, start, end, speed };
  });
  return { segments, speed, targetDuration, requiredDuration, duration, needsExtension };
}

export function sliceNarrationTiming(segments: NarrationSegment[], rangeStart: number, rangeEnd: number) {
  return segments.filter(segment => segment.end > rangeStart && segment.start < rangeEnd).map(segment => {
    const start = Math.max(segment.start, rangeStart);
    const end = Math.min(segment.end, rangeEnd);
    return { shotId: segment.shotId, text: segment.text, sourceDuration: segment.sourceDuration, speed: segment.speed,
      start: start - rangeStart, end: end - rangeStart, offset: start - segment.start, length: end - start };
  });
}
