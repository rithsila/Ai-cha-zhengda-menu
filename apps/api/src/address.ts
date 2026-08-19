/**
 * Arakawa residential address rules.
 *
 * KEEP IN SYNC with apps/menu/src/utils/address.ts — the menu app validates the
 * same fields in the browser so the customer sees the error before submitting,
 * and the API re-validates because a client can send anything.
 *
 * The shop is J03, Ground Floor, Arakawa and only delivers inside Arakawa.
 * An address is a building letter plus a 4-digit room where the first two
 * digits are the floor: "G" + "1110" = building G, floor 11, room 10 -> G1110.
 * There are no rooms on the ground floor, so the floor part runs 01..22.
 */

export const BUILDINGS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const;
export const MIN_FLOOR = 1;
export const MAX_FLOOR = 22;
export const SHOP_UNIT = 'J03';
export const RESIDENCE_NAME = 'Arakawa';

export function isValidBuilding(building: unknown): boolean {
  return typeof building === 'string' && (BUILDINGS as readonly string[]).includes(building.trim().toUpperCase());
}

export function isValidRoom(room: unknown): boolean {
  if (typeof room !== 'string' || !/^\d{4}$/.test(room.trim())) return false;
  const floor = Number(room.trim().slice(0, 2));
  return floor >= MIN_FLOOR && floor <= MAX_FLOOR;
}

/** "1110" -> 11 */
export function floorFromRoom(room: string): number {
  return Number(room.trim().slice(0, 2));
}

/** "1110" -> 10 */
export function unitFromRoom(room: string): number {
  return Number(room.trim().slice(2));
}

/** "G" + "1110" -> "G1110" */
export function formatUnitCode(building: string, room: string): string {
  return `${building.trim().toUpperCase()}${room.trim()}`;
}

/** The readable line stored on the order and shown to staff. */
export function formatAddress(building: string, room: string): string {
  const code = formatUnitCode(building, room);
  const floor = floorFromRoom(room);
  const unit = unitFromRoom(room);
  return `${RESIDENCE_NAME} · Building ${building.trim().toUpperCase()} · Floor ${floor} · Room ${String(unit).padStart(2, '0')} (${code})`;
}

/** Keep one leading "+" and the digits; everything else is dropped. */
export function normalizePhone(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');
  return trimmed.startsWith('+') ? `+${digits}` : digits;
}

/** Display form: Telegram gives "85512345678" with no "+", so add one. */
export function formatPhone(raw: unknown): string {
  const phone = normalizePhone(raw);
  if (!phone) return '';
  return phone.startsWith('+') ? phone : `+${phone}`;
}

export function isValidPhone(raw: unknown): boolean {
  const digits = normalizePhone(raw).replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15;
}

export function isValidName(name: unknown): boolean {
  return typeof name === 'string' && name.trim().length >= 2 && name.trim().length <= 60;
}
