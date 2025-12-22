// Run this script to add PNR column to existing tickets
const pool = require("./db");

async function addPNRColumn() {
  const client = await pool.connect();
  
  try {
    console.log("🔧 Adding PNR column to tickets table...");
    
    // Add column if it doesn't exist
    await client.query(`
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS pnr VARCHAR(15);
    `);
    console.log("✅ PNR column added (or already exists)");
    
    // Update existing tickets with generated PNRs
    const updateResult = await client.query(`
      UPDATE tickets 
      SET pnr = LPAD(CAST(train_id AS TEXT), 3, '0') || 
                TO_CHAR(travel_date, 'YYYYMMDD') || 
                LPAD(CAST(ticket_id AS TEXT), 4, '0')
      WHERE pnr IS NULL
      RETURNING ticket_id, pnr;
    `);
    
    if (updateResult.rowCount > 0) {
      console.log(`✅ Generated PNRs for ${updateResult.rowCount} existing tickets:`);
      updateResult.rows.forEach(row => {
        console.log(`   Ticket #${row.ticket_id} → PNR: ${row.pnr}`);
      });
    } else {
      console.log("ℹ️  No tickets needed PNR generation");
    }
    
    // Add index
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tickets_pnr ON tickets(pnr);
    `);
    console.log("✅ Index created on PNR column");
    
    // Verify
    const verifyResult = await client.query(`
      SELECT ticket_id, pnr, train_id, travel_date 
      FROM tickets 
      ORDER BY ticket_id 
      LIMIT 5;
    `);
    
    console.log("\n📋 Sample tickets with PNRs:");
    console.table(verifyResult.rows);
    
    console.log("\n✅ Migration completed successfully!");
    
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

addPNRColumn();
