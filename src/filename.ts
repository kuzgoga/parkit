export function decodeFilename(filename: string): string {
  if ([...filename].some((character) => character.codePointAt(0)! > 0xff))
    return filename;

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(
      Buffer.from(filename, "latin1"),
    );
  } catch {
    return filename;
  }
}
