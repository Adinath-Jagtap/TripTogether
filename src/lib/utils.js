/**
 * Utility functions for TripTogether
 */

// ─── Date / Time ─────────────────────────────────────────────────────────────

export function formatDate(dateString) {
  if (!dateString) return '—';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateShort(dateString) {
  if (!dateString) return '—';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function formatTime(datetimeString) {
  if (!datetimeString) return '—';
  const date = new Date(datetimeString);
  return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function formatDateRange(startDate, endDate) {
  if (!startDate || !endDate) return '—';
  const start = new Date(startDate);
  const end = new Date(endDate);
  const startStr = start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const endStr = end.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${startStr} – ${endStr}`;
}

export function getDayNumber(tripStartDate, bookingDate) {
  if (!tripStartDate || !bookingDate) return 1;
  const start = new Date(tripStartDate);
  const booking = new Date(bookingDate);
  const diff = Math.floor((booking - start) / (1000 * 60 * 60 * 24));
  return Math.max(1, diff + 1);
}

export function getTripDuration(startDate, endDate) {
  if (!startDate || !endDate) return 0;
  const start = new Date(startDate);
  const end = new Date(endDate);
  return Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
}

export function getDayLabel(tripStartDate, dayNumber) {
  if (!tripStartDate) return `Day ${dayNumber}`;
  const date = new Date(tripStartDate);
  date.setDate(date.getDate() + dayNumber - 1);
  return date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function isUpcoming(datetimeString) {
  if (!datetimeString) return false;
  return new Date(datetimeString) > new Date();
}

export function isPast(datetimeString) {
  if (!datetimeString) return false;
  return new Date(datetimeString) < new Date();
}

export function minutesToHours(minutes) {
  if (!minutes) return '0m';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// ─── Currency ─────────────────────────────────────────────────────────────────

export function formatCurrency(amount, currency = 'INR') {
  if (amount === null || amount === undefined) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatCurrencyShort(amount, currency = 'INR') {
  if (amount === null || amount === undefined) return '—';
  if (Math.abs(amount) >= 100000) return `${currency === 'INR' ? '₹' : '$'}${(amount / 100000).toFixed(1)}L`;
  if (Math.abs(amount) >= 1000) return `${currency === 'INR' ? '₹' : '$'}${(amount / 1000).toFixed(1)}K`;
  return formatCurrency(amount, currency);
}

// ─── Invite Code ──────────────────────────────────────────────────────────────

export function generateInviteCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// ─── Booking Types ────────────────────────────────────────────────────────────

export const BOOKING_TYPES = {
  flight: { label: 'Flight', icon: 'Plane', color: '#B45309' },
  hotel: { label: 'Hotel', icon: 'Building2', color: '#15803D' },
  transfer: { label: 'Transfer', icon: 'Car', color: '#6B7280' },
  activity: { label: 'Activity', icon: 'Compass', color: '#0369A1' },
  event: { label: 'Event', icon: 'Calendar', color: '#7C3AED' },
  train: { label: 'Train', icon: 'Train', color: '#B45309' },
  bus: { label: 'Bus', icon: 'Bus', color: '#6B7280' },
};

export const BOOKING_STATUS_LABELS = {
  confirmed: { label: 'Confirmed', color: 'success' },
  at_risk: { label: 'At Risk', color: 'warning' },
  disrupted: { label: 'Disrupted', color: 'danger' },
  cancelled: { label: 'Cancelled', color: 'danger' },
  rebooked: { label: 'Rebooked', color: 'info' },
};

export const EXPENSE_CATEGORIES = {
  transport: { label: 'Transport', icon: 'Car' },
  accommodation: { label: 'Accommodation', icon: 'Building2' },
  food: { label: 'Food & Drinks', icon: 'UtensilsCrossed' },
  activity: { label: 'Activity', icon: 'Compass' },
  shopping: { label: 'Shopping', icon: 'ShoppingBag' },
  emergency: { label: 'Emergency', icon: 'AlertCircle' },
  other: { label: 'Other', icon: 'MoreHorizontal' },
};

// ─── String Helpers ───────────────────────────────────────────────────────────

export function getInitials(name) {
  if (!name) return '?';
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function truncate(str, maxLen = 40) {
  if (!str) return '';
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + '...';
}

export function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ─── Budget Helpers ───────────────────────────────────────────────────────────

export function getBudgetPercentage(spent, budget) {
  if (!budget || budget === 0) return 0;
  return Math.min(100, Math.round((spent / budget) * 100));
}

export function getBudgetStatus(spent, budget) {
  const pct = getBudgetPercentage(spent, budget);
  if (pct >= 100) return 'over';
  if (pct >= 80) return 'warning';
  return 'ok';
}

// ─── Resilience Score ─────────────────────────────────────────────────────────

export function getResilienceColor(score) {
  if (score >= 75) return 'var(--success)';
  if (score >= 50) return 'var(--warning)';
  return 'var(--danger)';
}

export function getResilienceLabel(score) {
  if (score >= 75) return 'Resilient';
  if (score >= 50) return 'At Risk';
  return 'Critical';
}

// ─── Avatar Color ─────────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  '#B45309', '#15803D', '#0369A1', '#7C3AED',
  '#BE185D', '#B91C1C', '#1D4ED8', '#0F766E',
];

export function getAvatarColor(name) {
  if (!name) return AVATAR_COLORS[0];
  const idx = name.charCodeAt(0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}
