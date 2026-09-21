import { parse, modify, applyEdits, printParseErrorCode } from "jsonc-parser";
export const ghosttyFields = [
  ["font-family", "Font family", "text"],
  ["font-size", "Font size", "number"],
  ["theme", "Theme name", "text"],
  ["window-padding-x", "Horizontal padding", "number"],
  ["window-padding-y", "Vertical padding", "number"],
  ["background-opacity", "Opacity (0–1)", "number"],
  ["cursor-style", "Cursor style", "select"],
  ["cursor-style-blink", "Blink cursor", "select"],
];
export function ghosttyValues(content) {
  const values = {};
  for (const line of content.split("\n")) {
    const match = line.match(/^\s*([\w-]+)\s*=\s*(.*?)\s*$/);
    if (match) values[match[1]] = match[2];
  }
  return values;
}
export function updateGhostty(content, values) {
  let lines = content.split("\n");
  const previous = ghosttyValues(content);
  for (const [key, value] of Object.entries(values)) {
    if (!ghosttyFields.some((f) => f[0] === key))
      throw new Error("Unknown Ghostty control");
    if (/[\r\n\0]/.test(value))
      throw new Error("Settings must fit on one line");
    if (previous[key] === value) continue;
    const pattern = new RegExp(`^\\s*${key}\\s*=`);
    const indexes = lines.flatMap((line, index) =>
      pattern.test(line) ? [index] : [],
    );
    if (indexes.length)
      lines = lines
        .filter((_, index) => !indexes.slice(0, -1).includes(index))
        .map((line) => (pattern.test(line) ? `${key} = ${value}` : line));
    else if (value !== "") lines.push(`${key} = ${value}`);
  }
  return lines.join("\n").replace(/\n*$/, "\n");
}
export function parseFastfetch(content) {
  const errors = [];
  const data = parse(content || "{}", errors, {
    allowTrailingComma: true,
    disallowComments: false,
  });
  if (errors.length)
    throw new Error(
      `Invalid JSONC: ${printParseErrorCode(errors[0].error)} at character ${errors[0].offset}`,
    );
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new Error("Fastfetch configuration must be an object");
  return data;
}
export function editFastfetch(content, path, value) {
  parseFastfetch(content);
  return applyEdits(
    content || "{}",
    modify(content || "{}", path, value, {
      formattingOptions: { insertSpaces: true, tabSize: 4 },
    }),
  );
}
export function moduleType(module) {
  return typeof module === "string" ? module : module.type;
}
