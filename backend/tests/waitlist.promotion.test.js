const request = require("supertest");
const {
  app,
  pool,
  TEST_DATE,
  getTestTrainId,
  ensureSchema,
  initTestTrain,
  restoreTrain,
  cleanupTestData,
  seedConfirmedTickets,
} = require("./waitlistTestUtils");

describe("Waitlist promotion on cancellation", () => {
  beforeAll(async () => {
    jest.setTimeout(30000);
    await ensureSchema();
    await initTestTrain();
  });

  beforeEach(async () => {
    await cleanupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    await restoreTrain();
  });

  test("cancelling one confirmed ticket promotes first waitlisted user and creates unread notification", async () => {
    const trainId = getTestTrainId();
    await seedConfirmedTickets(5);

    const waitlistedEmail = "wl-promoted-1@example.com";
    const joinResponse = await request(app).post("/api/waitlist/join").send({
      email: waitlistedEmail,
      trainId,
      travelDate: TEST_DATE,
      price: 100,
    });

    expect([200, 201]).toContain(joinResponse.statusCode);

    const ticketToCancel = await pool.query(
      `SELECT ticket_id, user_email
       FROM tickets
       WHERE train_id = $1
         AND travel_date = $2
       ORDER BY ticket_id ASC
       LIMIT 1`,
      [trainId, TEST_DATE]
    );

    const cancelTicketId = ticketToCancel.rows[0].ticket_id;
    const cancelOwner = ticketToCancel.rows[0].user_email;

    const cancelResponse = await request(app)
      .patch(`/api/tickets/${cancelTicketId}/cancel`)
      .set("x-user-email", cancelOwner)
      .send({});

    expect(cancelResponse.statusCode).toBe(200);
    expect(cancelResponse.body.waitlistPromotion).toBeTruthy();
    expect(cancelResponse.body.waitlistPromotion.userEmail).toBe(waitlistedEmail);

    const promotedIntentCount = await pool.query(
      `SELECT COUNT(*)::int AS promoted_count
       FROM booking_intents
       WHERE user_email = $1
         AND train_id = $2
         AND travel_date = $3
         AND status = 'PAYMENT_PENDING'`,
      [waitlistedEmail, trainId, TEST_DATE]
    );

    expect(Number(promotedIntentCount.rows[0]?.promoted_count || 0)).toBe(1);

    const unreadResult = await pool.query(
      `SELECT COUNT(*)::int AS unread
       FROM notifications
       WHERE user_email = $1
         AND type = 'WAITLIST_PROMOTED'
         AND is_read = FALSE`,
      [waitlistedEmail]
    );

    expect(Number(unreadResult.rows[0]?.unread || 0)).toBe(1);
  });
});
