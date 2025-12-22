// Test script to verify PNG preview generation
const { generateTicketPreviewPNGWithPuppeteer } = require("./utils/previewWithPuppeteer");
const fs = require("fs");
const path = require("path");

// Sample ticket data
const sampleTicket = {
  ticket_id: 999,
  pnr: "001202512050999",
  user_email: "test@example.com",
  train_id: 1,
  train_name: "Rajdhani Express",
  source: "Mumbai",
  destination: "Delhi",
  travel_date: "2025-12-10",
  departure_time: "16:30:00",
  arrival_time: "08:15:00",
  seat_no: "A1",
  price: 2500,
  booking_date: new Date().toISOString()
};

async function testPreview() {
  console.log("🧪 Starting PNG preview generation test...");
  console.log("📋 Sample ticket:", JSON.stringify(sampleTicket, null, 2));
  
  try {
    console.log("\n⏳ Generating PNG preview...");
    const startTime = Date.now();
    
    const pngBuffer = await generateTicketPreviewPNGWithPuppeteer(sampleTicket, {
      viewport: { width: 1200, height: 1600 },
      waitFor: 500
    });
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log("\n✅ PNG generated successfully!");
    console.log("📊 Buffer size:", pngBuffer.length, "bytes");
    console.log("⏱️ Generation time:", duration, "ms");
    console.log("🔍 First 8 bytes (PNG signature):", pngBuffer.slice(0, 8).toString('hex'));
    
    // Save to test file
    const testFile = path.join(__dirname, "cache", "previews", "test-999.png");
    fs.writeFileSync(testFile, pngBuffer);
    console.log("💾 Saved to:", testFile);
    console.log("\n✅ Test completed successfully!");
    console.log("👉 Open the file to verify the preview looks correct");
    
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Test failed!");
    console.error("Error:", error.message);
    console.error("Stack:", error.stack);
    process.exit(1);
  }
}

testPreview();
