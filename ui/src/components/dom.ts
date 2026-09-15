/**
 * dom.ts : a small helper for building page elements in code
 *
 * Writing document.createElement, then setting each attribute, then
 * appending each child, gets long quickly. This helper does it in one call:
 *
 *   element('button', { class: 'button', type: 'button' }, 'Next')
 *
 * Text is always added as text, never as HTML. Details that come from the
 * API (such as a provider name) can therefore never inject markup into the page.
 *
 * The type of what comes back follows the tag name: element('img') gives an
 * HTMLImageElement, so TypeScript knows it has properties such as src.
 * HTMLElementTagNameMap is TypeScript's built-in list of tags and their types.
 */
export function element<Tag extends keyof HTMLElementTagNameMap>(
  tag: Tag,
  attributes: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[Tag] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    node.setAttribute(name, value);
  }
  node.append(...children);
  return node;
}
