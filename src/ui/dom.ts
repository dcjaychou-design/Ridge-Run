export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`#${id} is missing from the document`);
  return node as T;
}

export function query<T extends Element = Element>(
  selector: string,
  root: ParentNode = document,
): T {
  const node = root.querySelector(selector);
  if (!node) throw new Error(`${selector} is missing from the document`);
  return node as T;
}
