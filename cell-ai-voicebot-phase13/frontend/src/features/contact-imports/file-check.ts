const MAX_BYTES = 10 * 1024 * 1024;

/** Client-side check before uploading (the server checks again). */
export const checkFile = (file: File): string | null => {
  const ext = file.name.toLowerCase().split('.').pop();
  if (ext === 'xls')
    return 'Old .xls files are not supported — open the file in Excel and save it as .xlsx.';
  if (ext !== 'csv' && ext !== 'xlsx') return 'Choose a .csv or .xlsx file.';
  if (file.size > MAX_BYTES) return 'The file is larger than 10 MB — split it into smaller files.';
  return null;
};
