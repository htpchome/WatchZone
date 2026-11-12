export interface PlainTextOptions {
  readonly allowCharacter?: (character: string) => boolean;
  readonly maxLength: number;
}

/** Normalize user-authored single-line text without discarding valid Unicode. */
export function sanitizePlainTextInput(
  value: string,
  { allowCharacter, maxLength }: PlainTextOptions,
): string {
  const characters: string[] = [];
  let previousWasSpace = false;
  for (const sourceCharacter of value.normalize("NFKC")) {
    const character = /\s/u.test(sourceCharacter) ? " " : sourceCharacter;
    if (/\p{C}/u.test(character)) continue;
    if (allowCharacter && !allowCharacter(character)) continue;
    if (character === " ") {
      if (characters.length === 0 || previousWasSpace) continue;
      previousWasSpace = true;
    } else {
      previousWasSpace = false;
    }
    characters.push(character);
    if (characters.length >= maxLength) break;
  }
  return characters.join("");
}

export function normalizePlainText(
  value: string,
  options: PlainTextOptions,
): string {
  return sanitizePlainTextInput(value, options).trimEnd();
}
