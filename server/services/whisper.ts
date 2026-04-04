import { spawn } from "child_process";
import { writeFile, unlink, readFile, stat } from "fs/promises";
import { randomUUID } from "crypto";
import { tmpdir } from "os";
import { join } from "path";
import OpenAI, { toFile } from "openai";

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      ...(process.env.OPENAI_API_KEY ? {} : { baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL }),
    });
  }
  return _openai;
}

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

export interface WhisperSegment {
  id: number;
  start: number;
  end: number;
  text: string;
  words: WordTimestamp[];
}

export interface WhisperResult {
  text: string;
  segments: WhisperSegment[];
  words: WordTimestamp[];
  language: string;
}

export async function downloadYouTubeAudio(videoId: string): Promise<Buffer> {
  const outputPath = join(tmpdir(), `yt-audio-${randomUUID()}.mp3`);
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  await new Promise<void>((resolve, reject) => {
    const proc = spawn("yt-dlp", [
      "-x",
      "--audio-format", "mp3",
      "--audio-quality", "5",
      "-o", outputPath,
      "--no-playlist",
      "--no-check-certificates",
      url,
    ]);

    let stderr = "";
    proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    proc.stdout.on("data", () => {});

    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`yt-dlp failed (code ${code}): ${stderr.slice(-500)}`));
    });
    proc.on("error", (err) => reject(new Error(`yt-dlp spawn error: ${err.message}`)));

    setTimeout(() => {
      try { proc.kill("SIGTERM"); } catch {}
      reject(new Error("yt-dlp timed out after 120s"));
    }, 120000);
  });

  try {
    const buffer = await readFile(outputPath);
    return buffer;
  } finally {
    await unlink(outputPath).catch(() => {});
  }
}

async function splitAudioIntoChunks(audioBuffer: Buffer, maxSizeMB: number = 24): Promise<{ buffer: Buffer; offsetSeconds: number }[]> {
  const maxBytes = maxSizeMB * 1024 * 1024;
  if (audioBuffer.length <= maxBytes) {
    return [{ buffer: audioBuffer, offsetSeconds: 0 }];
  }

  const inputPath = join(tmpdir(), `split-input-${randomUUID()}.mp3`);
  await writeFile(inputPath, audioBuffer);

  try {
    const durationStr = await new Promise<string>((resolve, reject) => {
      const proc = spawn("ffprobe", [
        "-v", "quiet",
        "-show_entries", "format=duration",
        "-of", "csv=p=0",
        inputPath,
      ]);
      let out = "";
      proc.stdout.on("data", (c) => { out += c.toString(); });
      proc.on("close", (code) => {
        if (code === 0) resolve(out.trim());
        else reject(new Error("ffprobe failed"));
      });
      proc.on("error", reject);
    });

    const totalDuration = parseFloat(durationStr);
    if (isNaN(totalDuration) || totalDuration <= 0) {
      return [{ buffer: audioBuffer, offsetSeconds: 0 }];
    }

    const numChunks = Math.ceil(audioBuffer.length / maxBytes);
    const chunkDuration = Math.ceil(totalDuration / numChunks);
    const chunks: { buffer: Buffer; offsetSeconds: number }[] = [];

    for (let i = 0; i < numChunks; i++) {
      const startSec = i * chunkDuration;
      const outPath = join(tmpdir(), `chunk-${randomUUID()}.mp3`);

      await new Promise<void>((resolve, reject) => {
        const proc = spawn("ffmpeg", [
          "-i", inputPath,
          "-ss", String(startSec),
          "-t", String(chunkDuration),
          "-acodec", "libmp3lame",
          "-ar", "16000",
          "-ac", "1",
          "-y",
          outPath,
        ]);
        proc.stderr.on("data", () => {});
        proc.on("close", (code) => {
          if (code === 0) resolve();
          else reject(new Error(`ffmpeg chunk split failed`));
        });
        proc.on("error", reject);
      });

      try {
        const chunkBuf = await readFile(outPath);
        chunks.push({ buffer: chunkBuf, offsetSeconds: startSec });
      } finally {
        await unlink(outPath).catch(() => {});
      }
    }

    return chunks;
  } finally {
    await unlink(inputPath).catch(() => {});
  }
}

export async function transcribeWithWhisper(audioBuffer: Buffer, language?: string): Promise<WhisperResult> {
  const chunks = await splitAudioIntoChunks(audioBuffer);
  const allWords: WordTimestamp[] = [];
  const allSegments: WhisperSegment[] = [];
  let fullText = "";
  let detectedLanguage = language || "";

  for (const chunk of chunks) {
    const file = await toFile(chunk.buffer, "audio.mp3");

    const response = await getOpenAI().audio.transcriptions.create({
      file,
      model: "whisper-1",
      response_format: "verbose_json",
      timestamp_granularities: ["word", "segment"],
      ...(language ? { language } : {}),
    } as any);

    const resp = response as any;

    if (resp.language && !detectedLanguage) {
      detectedLanguage = resp.language;
    }

    if (resp.words) {
      for (const w of resp.words) {
        allWords.push({
          word: w.word,
          start: w.start + chunk.offsetSeconds,
          end: w.end + chunk.offsetSeconds,
        });
      }
    }

    if (resp.segments) {
      for (const seg of resp.segments) {
        const segWords: WordTimestamp[] = [];
        if (seg.words) {
          for (const w of seg.words) {
            segWords.push({
              word: w.word,
              start: w.start + chunk.offsetSeconds,
              end: w.end + chunk.offsetSeconds,
            });
          }
        }
        allSegments.push({
          id: allSegments.length,
          start: seg.start + chunk.offsetSeconds,
          end: seg.end + chunk.offsetSeconds,
          text: seg.text || "",
          words: segWords,
        });
      }
    }

    fullText += (fullText ? " " : "") + (resp.text || "");
  }

  return {
    text: fullText.trim(),
    segments: allSegments,
    words: allWords,
    language: detectedLanguage,
  };
}

export async function transcribeYouTubeVideo(videoId: string, language?: string): Promise<WhisperResult> {
  console.log(`[Whisper] Downloading audio for video: ${videoId}...`);
  const audioBuffer = await downloadYouTubeAudio(videoId);
  console.log(`[Whisper] Audio downloaded: ${(audioBuffer.length / 1024 / 1024).toFixed(1)}MB`);

  console.log(`[Whisper] Starting transcription...`);
  const result = await transcribeWithWhisper(audioBuffer, language);
  console.log(`[Whisper] Transcription complete: ${result.words.length} words, ${result.segments.length} segments`);

  return result;
}
