"use client";

import { useState, type SyntheticEvent } from "react";
import { inventoryFieldError, validateInventoryForm } from "@/lib/inventory-form-validation";

export function useInventoryForm() {
  const [errors, setErrors] = useState<Record<string, string>>({});
  return {
    errors,
    reset() { setErrors({}); },
    validate(form: HTMLFormElement) {
      const next = validateInventoryForm(form);
      setErrors(next);
      return Object.keys(next).length === 0;
    },
    onInput(event: SyntheticEvent<HTMLFormElement>) {
      const field = event.target;
      if ((field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) && errors[field.id]) {
        setErrors(previous => ({ ...previous, [field.id]: inventoryFieldError(field) }));
      }
    },
  };
}
