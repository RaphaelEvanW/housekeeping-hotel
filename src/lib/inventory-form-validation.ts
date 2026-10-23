type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

export function inventoryFieldError(field: Field) {
  const label = field.labels?.[0]?.textContent?.replace(/\*|\(opsional\)/gu, "").replace(/\s+/gu, " ").trim() || "Field ini";
  if (field.required && !field.value.trim()) return field.dataset.requiredMessage || `${label} wajib diisi.`;
  if (field.validity.badInput || field.validity.rangeUnderflow || field.validity.rangeOverflow || field.validity.stepMismatch) return field.dataset.invalidMessage || `${label} tidak valid.`;
  if ("maxLength" in field && field.maxLength >= 0 && field.value.length > field.maxLength) return `${label} maksimal ${field.maxLength} karakter.`;
  if (!field.validity.valid) return `Periksa ${label.toLocaleLowerCase("id-ID")}.`;
  return "";
}

export function validateInventoryForm(form: HTMLFormElement) {
  const errors: Record<string, string> = {};
  let first: Field | undefined;
  for (const element of Array.from(form.elements)) {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) || !element.willValidate || !element.id) continue;
    const message = inventoryFieldError(element);
    if (message) {
      errors[element.id] = message;
      first ??= element;
    }
  }
  if (first) {
    const target = first;
    const accordion = target.closest("details");
    if (accordion) accordion.open = true;
    requestAnimationFrame(() => target.focus());
  }
  return errors;
}
