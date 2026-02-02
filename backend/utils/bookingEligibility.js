/**
 * Booking Eligibility Utility
 * 
 * Implements the official booking rules:
 * 
 * Rule 1: Future Date → Booking allowed
 * Rule 2: Same Day, Before Departure → Booking allowed
 * Rule 3: Same Day, After Departure → NOT allowed (Train departed)
 * Rule 4: Past Date → NOT allowed
 * 
 * This matches real Indian Railway logic and is easy to explain in viva.
 */

/**
 * Check if booking is allowed for a given train on a specific travel date
 * 
 * @param {Object} params
 * @param {string} params.travelDate - Selected travel date (YYYY-MM-DD)
 * @param {string} params.scheduledDeparture - Train's daily departure time (HH:MM:SS or HH:MM)
 * @param {Date} [params.now] - Current datetime (optional, for testing)
 * @returns {Object} { allowed: boolean, reason: string, code: string }
 */
function checkBookingEligibility({ travelDate, scheduledDeparture, now = new Date() }) {
  // Parse travel date as local date (start of day)
  const [year, month, day] = travelDate.split('-').map(Number);
  const travelDateObj = new Date(year, month - 1, day, 0, 0, 0, 0);
  
  // Get today's date (start of day for comparison)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  
  // Calculate date difference in days
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
  
  // Rule 1: Future Date (more than today)
  if (diffDays > 0) {
    return {
      allowed: true,
      reason: "Booking open for future date",
      code: "FUTURE_DATE"
    };
  }
  
  // Same day booking - check departure time
  // Parse scheduled departure time
  const timeParts = scheduledDeparture.split(':').map(Number);
  const depHour = timeParts[0] || 0;
  const depMin = timeParts[1] || 0;
  const depSec = timeParts[2] || 0;
  
  // Create departure datetime for today
  const departureDateTime = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    depHour,
    depMin,
    depSec
  );
  
  // Rule 2: Same Day, Before Departure
  if (now < departureDateTime) {
    // Calculate minutes until departure
    const minsUntilDeparture = Math.floor((departureDateTime - now) / (1000 * 60));
    
    return {
      allowed: true,
      reason: `Booking open (departs in ${minsUntilDeparture} minutes)`,
      code: "SAME_DAY_OPEN",
      minsUntilDeparture
    };
  }
  
  // Rule 3: Same Day, After Departure
  return {
    allowed: false,
    reason: "Train has already departed for today",
    code: "DEPARTED"
  };
}

/**
 * Format departure time for display
 * @param {string} time24 - Time in HH:MM:SS or HH:MM format
 * @returns {string} Formatted time like "08:30 AM"
 */
function formatTime12Hour(time24) {
  if (!time24) return '';
  const [hours, minutes] = time24.split(':').map(Number);
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  return `${hours12}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

/**
 * Calculate actual departure datetime for a train on a specific date
 * @param {string} travelDate - YYYY-MM-DD
 * @param {string} scheduledDeparture - HH:MM:SS
 * @returns {Date}
 */
function getActualDepartureDateTime(travelDate, scheduledDeparture) {
  const [year, month, day] = travelDate.split('-').map(Number);
  const [hours, minutes, seconds] = scheduledDeparture.split(':').map(Number);
  
  return new Date(year, month - 1, day, hours || 0, minutes || 0, seconds || 0);
}

module.exports = {
  checkBookingEligibility,
  formatTime12Hour,
  getActualDepartureDateTime
};
