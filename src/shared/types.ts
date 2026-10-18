export type Role = "USER" | "MODERATOR" | "ADMIN";
export type UserStatus = "ACTIVE" | "SUSPENDED";
export type ListingStatus = "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "SOLD" | "ARCHIVED";
export type ListingCondition = "NEW" | "LIKE_NEW" | "GOOD" | "FAIR" | "FOR_PARTS";
export type ItemType = "PRODUCT" | "SERVICE" | "DIGITAL";
export type ReportReason = "FRAUD" | "PROHIBITED" | "WRONG_CATEGORY" | "SPAM" | "OTHER";
export type ReportStatus = "OPEN" | "REVIEWED" | "DISMISSED";
export type SortOption = "newest" | "oldest" | "price_asc" | "price_desc";

export const ITEM_TYPES: ItemType[] = ["PRODUCT", "SERVICE", "DIGITAL"];

export const LISTING_STATUSES: ListingStatus[] = [
  "DRAFT",
  "PENDING",
  "APPROVED",
  "REJECTED",
  "SOLD",
  "ARCHIVED",
];

export const CONDITIONS: ListingCondition[] = ["NEW", "LIKE_NEW", "GOOD", "FAIR", "FOR_PARTS"];

export const REPORT_REASONS: ReportReason[] = [
  "FRAUD",
  "PROHIBITED",
  "WRONG_CATEGORY",
  "SPAM",
  "OTHER",
];

export interface Wilaya {
  id: number;
  slug: string;
  nameFr: string;
  nameAr: string;
}

export interface Category {
  id: number;
  slug: string;
  nameFr: string;
  nameAr: string;
  parentId: number | null;
  icon: string;
  sortOrder: number;
  isActive: boolean;
  listingCount?: number;
  children?: Category[];
}

export interface PublicUser {
  id: string;
  displayName: string;
  wilayaId: number;
  bio: string | null;
  phone: string | null;
  phonePublic: boolean;
  whatsappPublic: boolean;
  memberSince: string;
}

export interface SessionUser {
  id: string;
  email: string;
  role: Role;
  status: UserStatus;
  displayName: string | null;
  avatarUrl?: string | null;
  phone: string | null;
  phonePublic: boolean;
  whatsappPublic: boolean;
  wilayaId: number | null;
  bio: string | null;
  profileComplete: boolean;
  csrfToken: string;
  storeName?: string | null;
  storeSlug?: string | null;
  commune?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  openingHours?: string | null;
  bannerUrl?: string | null;
  logoUrl?: string | null;
}

export interface StoreProfile {
  id: string;
  displayName: string;
  storeName: string | null;
  storeSlug: string | null;
  logoUrl?: string | null;
  avatarUrl?: string | null;
  commune: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  openingHours: string | null;
  bannerUrl: string | null;
  wilaya: { id: number; nameFr: string; nameAr: string };
  phone: string | null;
  whatsappPublic: boolean;
  bio: string | null;
  memberSince: string;
  followersCount: number;
  isFollowing?: boolean;
  averageRating: number;
  reviewsCount: number;
  customSortOrder?: string[] | null;
}

export interface StoreReview {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  reviewerName: string;
}

export interface ListingImage {
  id: string;
  url: string;
  position: number;
}

export interface ListingSummary {
  id: string;
  title: string;
  priceDa: number;
  originalPriceDa?: number | null;
  negotiable: boolean;
  condition: ListingCondition;
  status: ListingStatus;
  wilaya: { id: number; nameFr: string; nameAr: string };
  category: { id: number; slug: string; nameFr: string; nameAr: string };
  coverImage: string | null;
  createdAt: string;
  publishedAt: string | null;
  sellerDisplayName: string;
  sellerId?: string;
  storeName?: string | null;
  storeSlug?: string | null;
  sellerAvatarUrl?: string | null;
  storeLogoUrl?: string | null;
  sellerRemark?: string | null;
  itemType?: ItemType;
  isFavorite?: boolean;
  favoritesCount?: number;
  rejectionReason?: string | null;
  callClicks?: number;
  orderClicks?: number;
  averageRating?: number;
}

export type ListingAction = "edit" | "submit" | "mark_sold" | "archive" | "delete" | "relist";

export interface ListingDetail extends ListingSummary {
  description: string;
  images: ListingImage[];
  seller: PublicUser & {
    id: string;
    storeName?: string | null;
    storeSlug?: string | null;
    avatarUrl?: string | null;
    logoUrl?: string | null;
    followersCount?: number;
    averageRating?: number;
  };
  contactPhone: string | null;
  contactPhonePublic: boolean;
  contactWhatsapp: boolean;
  rejectionReason: string | null;
  sellerRemark?: string | null;
  viewCount: number;
  updatedAt: string;
  allowedActions: ListingAction[];
  isFavorite: boolean;
  isOwner?: boolean;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
}

export interface ModerationReview {
  id: string;
  listingId: string;
  moderatorId: string | null;
  moderatorName: string | null;
  action: "APPROVE" | "REJECT" | "REOPEN" | "REMOVE";
  reason: string | null;
  createdAt: string;
}

export interface ReportItem {
  id: string;
  listingId: string;
  listingTitle: string;
  listingStatus: ListingStatus;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  createdAt: string;
  reporterName: string;
}

export interface AuditEntry {
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface AdminStats {
  users: { total: number; suspended: number; moderators: number };
  listings: Record<ListingStatus, number>;
  reports: { open: number };
  pendingOldest: string | null;
}

export interface AdminUser {
  id: string;
  email: string;
  role: Role;
  status: UserStatus;
  displayName: string | null;
  phone?: string | null;
  wilayaName?: string | null;
  avatarUrl?: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  listingsCount: number;
}

export interface ShareOf<T> {
  value: T;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface MetaResponse {
  categories: Category[];
  wilayas: Wilaya[];
  conditions: ListingCondition[];
  itemTypes?: ItemType[];
  maxImages: number;
}
