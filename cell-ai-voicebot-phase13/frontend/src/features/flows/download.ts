/** Saves JSON as a file download in the browser. */
export const downloadJson = (fileName: string, data: unknown): void => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

/** Reads a picked file as JSON (`null` when it isn't JSON). */
export const readJsonFile = async (file: File): Promise<unknown> => {
  try {
    return JSON.parse(await file.text()) as unknown;
  } catch {
    return null;
  }
};
