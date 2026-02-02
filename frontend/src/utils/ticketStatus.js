/**
 * Ticket Status Utility - Single Source of Truth (Frontend)
 * 
 * Status Rules:
 * - UPCOMING:  now < departureDT
 * - RUNNING:   departureDT <= now < arrivalDT
 * - COMPLETED: now >= arrivalDT
 * 
 * Button Matrix:
 * | Status    | Track Train | Download PDF | Cancel Ticket |
 * |-----------|-------------|--------------|---------------|
 * | UPCOMING  | ✅ Enabled   | ✅ Enabled    | ✅ Enabled     |
 * | RUNNING   | ✅ Enabled   | ✅ Enabled    | ❌ Disabled    |
 * | COMPLETED | ❌ Disabled  | ✅ Enabled    | ❌ Disabled    |
 */

/**
 * Combines a date string with a time string to create a Date object
 * @param {string} dateStr - Date in YYYY-MM-DD format or Date object
 * @param {string} timeStr - Time in HH:MM:SS or HH:MM format
 * @returns {Date} Combined datetime
 */
export function combineDateAndTime(dateStr, timeStr) {
  // Parse the date (handle both string and Date object)
  const date = typeof dateStr === 'string' ? new Date(dateStr) : new Date(dateStr);
  
  // Parse time components
  const timeParts = timeStr.split(':');
  const hours = parseInt(timeParts[0], 10) || 0;
  const minutes = parseInt(timeParts[1], 10) || 0;
  const seconds = parseInt(timeParts[2], 10) || 0;
  
  // Create new date with the time set
  const result = new Date(date);
  result.setHours(hours, minutes, seconds, 0);
  
  return result;
}

/**
 * Add days to a date
 * @param {Date} date - The date to add to
 * @param {number} days - Number of days to add
 * @returns {Date} New date
 */
export function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Get the status of a ticket based on travel date and train times
 * 
 * PRIORITY: If ticket has backend-computed status (status, can_track, can_cancel, can_download),
 * use those directly. This ensures Backend is the Single Source of Truth.
 * 
 * @param {Object} ticket - Ticket object with travelDate, departureTime, arrivalTime, 
 *                          or backend-provided status fields
 * @param {Date} [now] - Current time (defaults to new Date())
 * @returns {{status: string, canTrack: boolean, canCancel: boolean, canDownload: boolean, 
 *            message: string, isDelayed: boolean, delayMinutes: number}}
 */
export function getTicketStatus(ticket, now = new Date()) {
  // If backend provided status, use it (Single Source of Truth)
  if (ticket.status && ticket.can_track !== undefined) {
    return {
      status: ticket.status,
      canTrack: ticket.can_track,
      canCancel: ticket.can_cancel,
      canDownload: ticket.can_download,
      message: ticket.status_message || '',
      isDelayed: ticket.is_delayed || false,
      delayMinutes: ticket.delay_minutes || 0,
      departureDT: null,
      arrivalDT: null
    };
  }
  
  // Fallback: compute locally (for backward compatibility)
  const { travelDate, travel_date, departureTime, departure_time, arrivalTime, arrival_time } = ticket;
  const tDate = travelDate || travel_date;
  const depTime = departureTime || departure_time || '00:00:00';
  const arrTime = arrivalTime || arrival_time || '23:59:59';
  
  // Compute departure and arrival DateTimes
  const departureDT = combineDateAndTime(tDate, depTime);
  let arrivalDT = combineDateAndTime(tDate, arrTime);
  
  // Handle overnight trains: if arrival is before or equal to departure, it's next day
  if (arrivalDT <= departureDT) {
    arrivalDT = addDays(arrivalDT, 1);
  }
  
  // Determine status based on current time
  let status, message;
  
  if (now < departureDT) {
    status = 'UPCOMING';
    message = 'Your journey is scheduled. You can track or cancel this ticket.';
  } else if (now >= departureDT && now < arrivalDT) {
    status = 'RUNNING';
    message = 'Your train is currently running. Cancellation is not available.';
  } else {
    status = 'COMPLETED';
    message = 'Your journey has been completed. Thank you for traveling with RailSmart!';
  }
  
  // Button permissions based on status (Button Matrix)
  const canTrack = status === 'UPCOMING' || status === 'RUNNING';
  const canCancel = status === 'UPCOMING';
  const canDownload = true; // Always allowed for records/history
  
  return {
    status,
    canTrack,
    canCancel,
    canDownload,
    message,
    isDelayed: false,
    delayMinutes: 0,
    departureDT,
    arrivalDT
  };
}

/**
 * Check if cancellation is allowed (with optional buffer time)
 * @param {Object} params
 * @param {string|Date} params.travelDate - The travel date
 * @param {string} params.departureTime - Departure time
 * @param {number} [params.bufferMinutes=30] - Minutes before departure to block cancellation
 * @param {Date} [params.now] - Current time
 * @returns {{allowed: boolean, reason: string}}
 */
export function canCancelTicket({ travelDate, departureTime, bufferMinutes = 30, now = new Date() }) {
  const depTime = departureTime || '00:00:00';
  const departureDT = combineDateAndTime(travelDate, depTime);
  
  // Calculate buffer time (departure minus buffer minutes)
  const bufferTime = new Date(departureDT);
  bufferTime.setMinutes(bufferTime.getMinutes() - bufferMinutes);
  
  if (now >= departureDT) {
    return {
      allowed: false,
      reason: 'Train has already departed. Cancellation is not available.'
    };
  }
  
  if (now >= bufferTime) {
    return {
      allowed: false,
      reason: `Cancellation is not allowed within ${bufferMinutes} minutes of departure.`
    };
  }
  
  return {
    allowed: true,
    reason: 'Cancellation is available.'
  };
}

/**
 * Format status for display with emoji
 * @param {string} status - UPCOMING, RUNNING, or COMPLETED
 * @returns {string} Formatted status with emoji
 */
export function formatStatusDisplay(status) {
  const statusMap = {
    'UPCOMING': '🎫 Upcoming',
    'RUNNING': '🚂 Running',
    'COMPLETED': '✅ Completed'
  };
  return statusMap[status] || status;
}

/**
 * Get status badge color
 * @param {string} status - UPCOMING, RUNNING, or COMPLETED
 * @returns {string} CSS color value
 */
export function getStatusColor(status) {
  const colorMap = {
    'UPCOMING': '#3b82f6',   // Blue
    'RUNNING': '#f59e0b',    // Amber/Orange
    'COMPLETED': '#10b981'   // Green
  };
  return colorMap[status] || '#6b7280';
}
