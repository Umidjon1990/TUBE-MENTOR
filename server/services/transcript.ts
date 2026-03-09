export interface TranscriptResult {
  text: string;
  source: "auto" | "manual" | "demo";
  sentences: string[];
}

export function splitIntoSentences(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split(/(?<=[.!?。？！])\s+|\n+/)
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

    const rawText = textMatches
      .map(m => {
        const content = m.replace(/<[^>]+>/g, "");
        return content
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&nbsp;/g, " ");
      })
      .join(" ");

    const cleaned = cleanTranscript(rawText);
    if (cleaned.length < 20) return null;

    return {
      text: cleaned,
      source: "auto",
      sentences: splitIntoSentences(cleaned),
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
  const cleaned = cleanTranscript(raw);
  return {
    text: cleaned,
    source: "manual",
    sentences: splitIntoSentences(cleaned),
  };
}
