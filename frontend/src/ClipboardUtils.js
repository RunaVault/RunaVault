// Fallback for browsers or insecure contexts without the async Clipboard API.
// The textarea holds the copied value, so it must be removed even if copying fails.
const copyWithTextarea = (text) => {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = 0;
  document.body.appendChild(textarea);
  textarea.select();
  try {
    if (!document.execCommand('copy')) throw new Error("Copy command was rejected");
  } finally {
    textarea.remove();
  }
};

// Throws if the text could not be copied.
export const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    copyWithTextarea(text);
  }
};
