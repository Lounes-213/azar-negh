/** Normalize an Algerian mobile number to +213XXXXXXXXX. Returns null if invalid. */
export function normalizeAlgerianPhone(raw: string): string | null {
  const digits = raw.replace(/[\s().-]/g, "");
  let local: string | null = null;
  if (/^0[567]\d{8}$/.test(digits)) local = digits.slice(1);
  else if (/^\+213[567]\d{8}$/.test(digits)) local = digits.slice(4);
  else if (/^00213[567]\d{8}$/.test(digits)) local = digits.slice(5);
  return local ? `+213${local}` : null;
}

/** Format +213XXXXXXXXX for display: 0X XX XX XX XX. */
export function displayAlgerianPhone(phone: string | null): string {
  if (!phone) return "";
  if (phone.startsWith("+213")) {
    return `0${phone.slice(4)}`.replace(/(\d{4})(\d{2})(\d{2})(\d{2})/, "$1 $2 $3 $4");
  }
  return phone;
}
