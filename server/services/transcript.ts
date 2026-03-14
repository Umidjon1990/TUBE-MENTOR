export interface TranscriptResult {
  text: string;
  source: "auto" | "manual" | "demo";
  sentences: string[];
  timedSubtitles?: TimedSubtitle[];
}

export interface TimedSubtitle {
  startTime: number;
  endTime: number;
  text: string;
}

export function splitIntoSentences(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split(/(?<=[.!?。？！؟])\s+|\n+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

export function cleanTranscript(raw: string): string {
  return raw
    .replace(/\[.*?\]/g, "")
    .replace(/\(.*?\)/g, "")
    .replace(/\d{1,2}:\d{2}(:\d{2})?\s*/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[^\S\n]{2,}/g, " ")
    .trim();
}

function parseTimestamp(ts: string): number {
  const parts = ts.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

function stripYouTubeDuration(text: string): string {
  return text
    .replace(/^\d+\s+seconds?/i, "")
    .replace(/^\d+\s+minutes?,\s*\d+\s+seconds?/i, "")
    .replace(/^\d+\s+minutes?/i, "")
    .replace(/^\d+\s+hours?,\s*\d+\s+minutes?(?:,\s*\d+\s+seconds?)?/i, "")
    .replace(/^\d+\s+daqiqa,?\s*\d+\s+soniya/i, "")
    .replace(/^\d+\s+daqiqa/i, "")
    .replace(/^\d+\s+soniya/i, "")
    .replace(/^\d+\s+soat,?\s*\d+\s+daqiqa(?:,?\s*\d+\s+soniya)?/i, "")
    .replace(/^\d+\s+секунд[аы]?/i, "")
    .replace(/^\d+\s+минут[аы]?,?\s*\d+\s+секунд[аы]?/i, "")
    .replace(/^\d+\s+минут[аы]?/i, "")
    .replace(/^\d+\s+час(?:а|ов)?,?\s*\d+\s+минут[аы]?(?:,?\s*\d+\s+секунд[аы]?)?/i, "")
    .trim();
}

export function isTimestampedFormat(text: string): boolean {
  const lines = text.trim().split(/\n/).filter(l => l.trim().length > 0);
  if (lines.length < 3) return false;
  let tsCount = 0;
  for (const line of lines) {
    if (/^\s*\d{1,2}:\d{2}(?::\d{2})?/.test(line)) tsCount++;
  }
  return tsCount / lines.length >= 0.3;
}

export function parseTimestampedTranscript(raw: string): TimedSubtitle[] {
  const lines = raw.trim().split(/\n/).filter(l => l.trim().length > 0);
  const segments: { startTime: number; text: string }[] = [];
  let pendingTime: number | null = null;

  for (const line of lines) {
    const tsMatch = line.match(/^\s*(\d{1,2}:\d{2}(?::\d{2})?)(.*)/);

    if (tsMatch) {
      pendingTime = null;
      const time = parseTimestamp(tsMatch[1]);
      let text = stripYouTubeDuration(tsMatch[2].trim());
      if (text.length > 0) {
        segments.push({ startTime: time, text });
      } else {
        pendingTime = time;
      }
    } else {
      const trimmed = line.trim();
      if (trimmed.length > 0) {
        if (pendingTime !== null) {
          segments.push({ startTime: pendingTime, text: trimmed });
          pendingTime = null;
        } else if (segments.length > 0) {
          segments[segments.length - 1].text += " " + trimmed;
        }
      }
    }
  }

  if (segments.length === 0) return [];

  segments.sort((a, b) => a.startTime - b.startTime);

  const result: TimedSubtitle[] = [];
  for (let i = 0; i < segments.length; i++) {
    const nextTime = i < segments.length - 1 ? segments[i + 1].startTime : segments[i].startTime + 5;
    const endTime = Math.max(nextTime, segments[i].startTime + 0.5);
    result.push({
      startTime: segments[i].startTime,
      endTime,
      text: segments[i].text,
    });
  }

  return result;
}

const SENTENCE_TERMINATORS = /[.!?؟!。？！،,]+\s*$/;
const STRONG_TERMINATORS = /[.!?؟!。？！]\s*$/;

function mergeSubtitlesIntoSentences(subs: TimedSubtitle[]): TimedSubtitle[] {
  if (subs.length <= 1) return subs;

  const GAP_THRESHOLD = 1.5;
  const MIN_WORDS_FOR_GAP_SPLIT = 3;
  const MIN_CHARS_PER_SEGMENT = 10;

  const merged: TimedSubtitle[] = [];
  let currentStart = subs[0].startTime;
  let currentEnd = subs[0].endTime;
  let currentText = subs[0].text;

  for (let i = 1; i < subs.length; i++) {
    const next = subs[i];
    const gap = next.startTime - currentEnd;
    const wordCount = currentText.trim().split(/\s+/).length;

    const isStrongEnd = STRONG_TERMINATORS.test(currentText);
    const isSignificantGap = gap >= GAP_THRESHOLD && wordCount >= MIN_WORDS_FOR_GAP_SPLIT;
    const isLongSegment = wordCount >= 8;

    if (isStrongEnd || isSignificantGap || isLongSegment) {
      merged.push({ startTime: currentStart, endTime: currentEnd, text: currentText.trim() });
      currentStart = next.startTime;
      currentEnd = next.endTime;
      currentText = next.text;
    } else {
      currentText += " " + next.text;
      currentEnd = next.endTime;
    }
  }
  merged.push({ startTime: currentStart, endTime: currentEnd, text: currentText.trim() });

  const cleaned: TimedSubtitle[] = [];
  for (let i = 0; i < merged.length; i++) {
    const seg = merged[i];
    if (seg.text.length < MIN_CHARS_PER_SEGMENT && i < merged.length - 1) {
      merged[i + 1] = {
        startTime: seg.startTime,
        endTime: merged[i + 1].endTime,
        text: seg.text + " " + merged[i + 1].text,
      };
    } else {
      cleaned.push(seg);
    }
  }

  return cleaned.length > 0 ? cleaned : merged;
}

export function cleanTimestampedText(raw: string): string {
  return raw
    .replace(/\[.*?\]/g, "")
    .replace(/\(.*?\)/g, "")
    .replace(/^\s*\d{1,2}:\d{2}(?::\d{2})?\s*/gm, "")
    .replace(/\d+\s+hours?,\s*\d+\s+minutes?(?:,\s*\d+\s+seconds?)?/gi, "")
    .replace(/\d+\s+minutes?,\s*\d+\s+seconds?/gi, "")
    .replace(/\d+\s+minutes?/gi, "")
    .replace(/\d+\s+seconds?/gi, "")
    .replace(/\d+\s+soat,?\s*\d+\s+daqiqa(?:,?\s*\d+\s+soniya)?/gi, "")
    .replace(/\d+\s+daqiqa,?\s*\d+\s+soniya/gi, "")
    .replace(/\d+\s+daqiqa/gi, "")
    .replace(/\d+\s+soniya/gi, "")
    .replace(/\d+\s+час(?:а|ов)?,?\s*\d+\s+минут[аы]?(?:,?\s*\d+\s+секунд[аы]?)?/gi, "")
    .replace(/\d+\s+минут[аы]?,?\s*\d+\s+секунд[аы]?/gi, "")
    .replace(/\d+\s+минут[аы]?/gi, "")
    .replace(/\d+\s+секунд[аы]?/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[^\S\n]{2,}/g, " ")
    .trim();
}

export async function tryExtractTranscript(videoId: string): Promise<TranscriptResult | null> {
  try {
    const response = await fetch(
      `https://www.youtube.com/watch?v=${videoId}`
    );
    if (!response.ok) return null;

    const html = await response.text();

    const captionMatch = html.match(/"captions":\s*(\{.*?"playerCaptionsTracklistRenderer".*?\})\s*,\s*"/s);
    if (!captionMatch) return null;

    let captionData: any;
    try {
      const jsonStr = captionMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      captionData = JSON.parse(jsonStr);
    } catch {
      return null;
    }

    const tracks = captionData?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!tracks || tracks.length === 0) return null;

    const track = tracks.find((t: any) => t.languageCode === "en") || tracks[0];
    if (!track?.baseUrl) return null;

    const captionResponse = await fetch(track.baseUrl);
    if (!captionResponse.ok) return null;

    const captionXml = await captionResponse.text();
    const textMatches = captionXml.match(/<text[^>]*>(.*?)<\/text>/gs);
    if (!textMatches || textMatches.length === 0) return null;

    const timedSegments: TimedSubtitle[] = [];
    for (const m of textMatches) {
      const startMatch = m.match(/start="([\d.]+)"/);
      const durMatch = m.match(/dur="([\d.]+)"/);
      const content = m.replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, " ")
        .trim();

      if (startMatch && content.length > 0) {
        const startTime = parseFloat(startMatch[1]);
        const duration = durMatch ? parseFloat(durMatch[1]) : 3;
        timedSegments.push({
          startTime,
          endTime: startTime + duration,
          text: content,
        });
      }
    }

    const mergedSubs = mergeSubtitlesIntoSentences(timedSegments);

    const rawText = mergedSubs.map(s => s.text).join(" ");
    const cleaned = cleanTranscript(rawText);
    if (cleaned.length < 20) return null;

    return {
      text: cleaned,
      source: "auto",
      sentences: mergedSubs.map(s => s.text),
      timedSubtitles: mergedSubs,
    };
  } catch {
    return null;
  }
}

const DEMO_TRANSCRIPT = `Today we will learn about the basics of programming. Programming is the process of creating instructions that tell a computer what to do. Every program starts with a simple idea. First, you need to understand variables. A variable is like a container that holds data. You can store numbers, text, or other types of information in variables. Next, we have functions. Functions are reusable blocks of code that perform specific tasks. They help us organize our code and avoid repetition. Loops are another important concept. A loop lets you repeat a set of instructions multiple times. For example, you might want to print numbers from 1 to 10. Conditional statements help your program make decisions. If a condition is true, one block of code runs. If it is false, a different block runs. Arrays allow you to store multiple values in a single variable. You can access each value by its position, called an index. Object-oriented programming organizes code into objects. Each object has properties and methods. This makes code easier to understand and maintain. Error handling is crucial for building reliable programs. Try-catch blocks help you manage unexpected situations gracefully. Finally, practice is the key to becoming a good programmer. Write code every day and learn from your mistakes. The more you practice, the better you will become.`;

export function getDemoTranscript(): TranscriptResult {
  const cleaned = cleanTranscript(DEMO_TRANSCRIPT);
  return {
    text: cleaned,
    source: "demo",
    sentences: splitIntoSentences(cleaned),
  };
}

export function processManualTranscript(raw: string): TranscriptResult {
  if (isTimestampedFormat(raw)) {
    const timedSubs = parseTimestampedTranscript(raw);
    const merged = mergeSubtitlesIntoSentences(timedSubs);
    const cleanedText = cleanTimestampedText(raw);
    const sentences = merged.map(s => s.text);

    return {
      text: cleanedText,
      source: "manual",
      sentences,
      timedSubtitles: merged,
    };
  }

  const cleaned = cleanTranscript(raw);
  return {
    text: cleaned,
    source: "manual",
    sentences: splitIntoSentences(cleaned),
  };
}
