/** `Shop example` → `shop-example`. */
export function slugify(name: string): string {
  return (
    (name || "diagram")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "diagram"
  );
}

/** Trigger a browser download. Text gets a UTF-8 charset so non-ASCII names survive. */
export function downloadFile(
  filename: string,
  data: Blob | string,
  mime = "application/octet-stream",
): void {
  let blob: Blob;
  if (typeof data === "string") {
    const type =
      /^text\/|\/(json|xml|sql)$|\+xml$/.test(mime) && !/charset=/i.test(mime)
        ? `${mime};charset=utf-8`
        : mime;
    blob = new Blob([data], { type });
  } else blob = data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Some browsers start the download asynchronously; don't revoke too early.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
