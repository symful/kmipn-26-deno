export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Browsers start the download asynchronously. Revoking in the same event
  // cancels some downloads before the browser has consumed the object URL.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
