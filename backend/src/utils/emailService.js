// Thin wrapper to match the "backend/src/utils" structure used in documentation/viva.
// The actual implementation lives in `backend/utils/emailService.js`.

const {
  isEmailEnabled,
  sendEmail,
  sendBookingEmail,
  sendCancellationEmail,
} = require("../../utils/emailService");

module.exports = {
  isEmailEnabled,
  sendEmail,
  sendBookingEmail,
  sendCancellationEmail,
};
