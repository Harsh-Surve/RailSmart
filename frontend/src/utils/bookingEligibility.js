/**
 * Booking Eligibility Utility (Frontend)
 * 
 * Mirrors the backend logic for immediate UI feedback.
 * 
 * Rules:
 * 1. Future Date → Allowed
 * 2. Same Day, Before Departure → Allowed
 * 3. Same Day, After Departure → NOT Allowed (Departed)
 * 4. Past Date → NOT Allowed
 */

/**
 * Check if booking is allowed
 * @param {string} travelDate - YYYY-MM-DD format
 * @param {string} departureTime - HH:MM or HH:MM:SS format
 * @returns {{ allowed: boolean, reason: string, code: string }}
 */
export function checkBookingEligibility(travelDate, departureTime) {
  if (!travelDate) {
    return { allowed: false, reason: "Please select a travel date", code: "NO_DATE" };
  }

  const now = new Date();
  
  // Parse travel date
  const [year, month, day] = travelDate.split('-').map(Number);
  const travelDateObj = new Date(year, month - 1, day, 0, 0, 0, 0);
  
  // Today at midnight
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  
  // Diff in days
  const diffMs = travelDateObj.getTime() - today.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  // Rule 4: Past Date
  if (diffDays < 0) {
    return {
      allowed: false,
      reason: "Cannot book for past dates",
      code: "PAST_DATE"
    };
  }
  
  // Rule 1: Future Date
  if (diffDays > 0) {
    return {
      allowed: true,
      reason: "Booking available",
      code: "FUTURE_DATE"
    };
  }
  
  // Same day - parse departure time
  const timeParts = (departureTime || "00:00").split(':').map(Number);
  const depHour = timeParts[0] || 0;
  const depMin = timeParts[1] || 0;
  
  const departureDateTime = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    depHour,
    depMin,
    0
  );
  
  // Rule 2: Before departure
  if (now < departureDateTime) {
    const minsUntil = Math.floor((departureDateTime - now) / (1000 * 60));
    const hoursUntil = Math.floor(minsUntil / 60);
    const minsRemainder = minsUntil % 60;
    
    const timeText = hoursUntil > 0 
      ? `${hoursUntil}h ${minsRemainder}m`
      : `${minsUntil} min`;
    
    return {
      allowed: true,
      reason: `Departs in ${timeText}`,
      code: "SAME_DAY_OPEN",
      minsUntilDeparture: minsUntil
    };
  }
  
  // Rule 3: After departure
  return {
    allowed: false,
    reason: "Train has departed",
    code: "DEPARTED"
  };
}

/**
 * Format 24h time to 12h display
 * @param {string} time24 - HH:MM or HH:MM:SS
 * @returns {string} - e.g., "8:30 AM"
 */
export function formatTime12Hour(time24) {
  if (!time24) return '';
  const [hours, minutes] = time24.split(':').map(Number);
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  return `${hours12}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

/**
 * Get minimum allowed date (today) for date picker
 * @returns {string} YYYY-MM-DD
 */
export function getMinBookingDate() {
  const today = new Date();
  return today.toISOString().split('T')[0];
}

/**
 * Get maximum allowed date (90 days from now - typical railway limit)
 * @returns {string} YYYY-MM-DD
 */
export function getMaxBookingDate() {
  const future = new Date();
  future.setDate(future.getDate() + 90);
  return future.toISOString().split('T')[0];
}
