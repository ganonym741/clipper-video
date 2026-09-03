export function extractFirstUrl(value: string) {
  const trimmed = value.trim();
  const markdownMatch = trimmed.match(/\((https?:\/\/[^)\s]+)\)/);

  if (markdownMatch?.[1]) {
    return markdownMatch[1];
  }

  const plainMatch = trimmed.match(/https?:\/\/\S+/);

  if (!plainMatch?.[0]) {
    return trimmed;
  }

  return plainMatch[0].replace(/[)\].,]+$/, "");
}
