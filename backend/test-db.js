require("dotenv").config();
const pool = require("./db");

async function testDatabase() {
  console.log("🔍 Testing database connection and tickets...\n");

  try {
    // Test connection
    const timeResult = await pool.query("SELECT NOW()");
    console.log("✅ Database connected at:", timeResult.rows[0].now);

    // Count all tickets
    const countResult = await pool.query("SELECT COUNT(*) FROM tickets");
    console.log("📊 Total tickets in database:", countResult.rows[0].count);

    // Get all tickets with details
    const ticketsResult = await pool.query(`
      SELECT t.ticket_id, t.user_email, t.train_id, t.seat_no, t.travel_date, 
             t.price, t.booking_date, tr.train_name
      FROM tickets t
      LEFT JOIN trains tr ON t.train_id = tr.train_id
      ORDER BY t.booking_date DESC
      LIMIT 10
    `);

    if (ticketsResult.rows.length > 0) {
      console.log("\n📋 Recent tickets:");
      ticketsResult.rows.forEach((ticket, i) => {
        console.log(`\n${i + 1}. Ticket ID: ${ticket.ticket_id}`);
        console.log(`   Email: ${ticket.user_email}`);
        console.log(`   Train: ${ticket.train_name || 'N/A'} (ID: ${ticket.train_id})`);
        console.log(`   Seat: ${ticket.seat_no}`);
        console.log(`   Travel Date: ${ticket.travel_date}`);
        console.log(`   Price: ₹${ticket.price}`);
        console.log(`   Booked: ${ticket.booking_date}`);
      });
    } else {
      console.log("\n⚠️  No tickets found in database");
    }

    // Check trains table
    const trainsResult = await pool.query("SELECT COUNT(*) FROM trains");
    console.log("\n📊 Total trains in database:", trainsResult.rows[0].count);

  } catch (error) {
    console.error("❌ Database error:", error.message);
    console.error("Stack:", error.stack);
  } finally {
    await pool.end();
    console.log("\n✅ Database connection closed");
  }
}

testDatabase();
