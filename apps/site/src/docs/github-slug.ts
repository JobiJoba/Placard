/**
 * Approximate GitHub heading anchors so in-page TOC links match
 * both github.com blob view and the docs site.
 * @see https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax#heading-ids
 */
export function githubHeadingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/ /g, "-")
}
