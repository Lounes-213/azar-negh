import type { ListingAction, ListingStatus, Role } from "../../shared/types";
import { HttpError } from "../lib/http";

/** Allowed status transitions, enforced server-side. */
export const STATUS_TRANSITIONS: Record<ListingStatus, ListingStatus[]> = {
  DRAFT: ["PENDING", "ARCHIVED"],
  PENDING: ["APPROVED", "REJECTED"],
  APPROVED: ["PENDING", "SOLD", "ARCHIVED"],
  REJECTED: ["DRAFT", "PENDING", "ARCHIVED"],
  SOLD: ["APPROVED", "ARCHIVED"],
  ARCHIVED: ["PENDING"],
};

export function assertTransition(from: ListingStatus, to: ListingStatus): void {
  if (!STATUS_TRANSITIONS[from].includes(to)) {
    throw new HttpError(
      409,
      "INVALID_TRANSITION",
      `Transition de statut impossible : ${from} → ${to}.`,
    );
  }
}

export function isPublicStatus(status: ListingStatus): boolean {
  return status === "APPROVED" || status === "SOLD";
}

export function canViewListing(
  status: ListingStatus,
  sellerId: string,
  viewer: { id: string; role: Role } | null,
): boolean {
  if (isPublicStatus(status)) return true;
  if (!viewer) return false;
  if (viewer.id === sellerId) return true;
  return viewer.role === "MODERATOR" || viewer.role === "ADMIN";
}

export function allowedActions(
  status: ListingStatus,
  isOwner: boolean,
  role: Role,
): ListingAction[] {
  if (!isOwner) return [];
  const actions: ListingAction[] = [];
  if (status === "DRAFT" || status === "REJECTED") {
    actions.push("edit", "submit");
    actions.push("delete");
  }
  if (status === "APPROVED") actions.push("edit", "mark_sold", "archive");
  if (status === "SOLD") actions.push("archive", "relist");
  if (status === "REJECTED" || status === "DRAFT") actions.push("archive");
  if (status === "PENDING" && role === "ADMIN") actions.push("archive");
  return actions;
}

export function assertOwnerOrStaff(sellerId: string, viewer: { id: string; role: Role }): void {
  if (sellerId !== viewer.id && viewer.role !== "ADMIN") {
    throw new HttpError(403, "FORBIDDEN", "Cette annonce ne vous appartient pas.");
  }
}

/** Material edits on a published listing force it back through moderation. */
export function statusAfterSellerEdit(status: ListingStatus): ListingStatus {
  if (status === "DRAFT" || status === "REJECTED") return "DRAFT";
  if (status === "APPROVED") return "PENDING";
  throw new HttpError(409, "NOT_EDITABLE", "Cette annonce ne peut plus être modifiée.");
}
