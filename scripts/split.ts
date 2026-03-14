/**
 * 智能分段模块
 * 按语义边界将长文切分为适合LLM处理的段落
 */

const MIN_SEGMENT_LENGTH = 100;
const MAX_SEGMENT_LENGTH = 1500;

export interface Segment {
  index: number;
  text: string;
  charCount: number;
}

/**
 * 将文章内容智能分段
 */
export function splitArticle(content: string): Segment[] {
  // 第一步：按标题和空行分段
  const rawSegments = splitByHeadings(content);

  // 第二步：合并过短段落
  const merged = mergeShortSegments(rawSegments);

  // 第三步：拆分过长段落
  const final = splitLongSegments(merged);

  return final.map((text, index) => ({
    index,
    text,
    charCount: text.length,
  }));
}

/**
 * 按Markdown标题和双空行分段
 */
function splitByHeadings(content: string): string[] {
  const segments: string[] = [];
  let current: string[] = [];

  for (const line of content.split("\n")) {
    // 遇到标题行，且当前段不为空，则切分
    if (line.match(/^#{1,3}\s+/) && current.length > 0) {
      const text = current.join("\n").trim();
      if (text) segments.push(text);
      current = [line];
    } else {
      current.push(line);
    }
  }

  // 最后一段
  const text = current.join("\n").trim();
  if (text) segments.push(text);

  return segments;
}

/**
 * 合并过短的段落到前一段
 */
function mergeShortSegments(segments: string[]): string[] {
  const result: string[] = [];

  for (const seg of segments) {
    if (
      result.length > 0 &&
      result[result.length - 1].length < MIN_SEGMENT_LENGTH
    ) {
      result[result.length - 1] += "\n\n" + seg;
    } else if (seg.length < MIN_SEGMENT_LENGTH && result.length > 0) {
      result[result.length - 1] += "\n\n" + seg;
    } else {
      result.push(seg);
    }
  }

  return result;
}

/**
 * 拆分过长的段落（按句号切分）
 */
function splitLongSegments(segments: string[]): string[] {
  const result: string[] = [];

  for (const seg of segments) {
    if (seg.length <= MAX_SEGMENT_LENGTH) {
      result.push(seg);
      continue;
    }

    // 按中文句号、英文句号、换行符切分
    const sentences = seg.split(/(?<=[。！？.!?\n])/);
    let current = "";

    for (const sentence of sentences) {
      if (
        current.length + sentence.length > MAX_SEGMENT_LENGTH &&
        current.length > 0
      ) {
        result.push(current.trim());
        current = sentence;
      } else {
        current += sentence;
      }
    }

    if (current.trim()) {
      result.push(current.trim());
    }
  }

  return result;
}
