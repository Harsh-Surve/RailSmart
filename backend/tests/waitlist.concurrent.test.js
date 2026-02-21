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

describe("Concurrent booking and waitlist behavior", () => {
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

  test("allocates only one seat lock for the same seat under concurrent booking requests", async () => {
    const trainId = getTestTrainId();
    const seatNo = "S99";

    const requests = Array.from({ length: 10 }).map((_, index) =>
      request(app)
        .post("/api/book-ticket")
        .send({
          email: `seatrace-${index + 1}@example.com`,
          trainId,
          travelDate: TEST_DATE,
          seatNo,
          price: 100,
        })
    );

    const responses = await Promise.all(requests);

    const created = responses.filter((response) => response.statusCode === 200 && response.body?.status === "CREATED");
    const conflicts = responses.filter((response) => response.statusCode === 409);

    expect(created.length).toBe(1);
    expect(conflicts.length).toBe(9);

    const activeIntents = await pool.query(
      `SELECT COUNT(*)::int AS active_count
       FROM booking_intents
       WHERE train_id = $1
         AND travel_date = $2
         AND seat_no = $3
         AND status IN ('PAYMENT_PENDING', 'CONFIRMED')`,
      [trainId, TEST_DATE, seatNo]
    );

    expect(Number(activeIntents.rows[0]?.active_count || 0)).toBe(1);
  });

  test("assigns stable unique waitlist positions under concurrent joins when train is full", async () => {
    const trainId = getTestTrainId();
    await seedConfirmedTickets(5);

    const joins = Array.from({ length: 10 }).map((_, index) => {
      const email = `waittest-${index + 1}@example.com`;
      return request(app).post("/api/waitlist/join").send({
        email,
        trainId,
        travelDate: TEST_DATE,
        price: 100,
      });
    });

    const responses = await Promise.all(joins);
    responses.forEach((response) => {
      expect([200, 201]).toContain(response.statusCode);
      expect(["WAITLISTED", "WAITLIST_EXISTS"]).toContain(response.body?.status);
    });

    const waitlistRows = await pool.query(
      `SELECT user_email, waitlist_position
       FROM waitlist_entries
       WHERE train_id = $1
         AND travel_date = $2
         AND status = 'WAITLIST'
       ORDER BY waitlist_position ASC`,
      [trainId, TEST_DATE]
    );

    expect(waitlistRows.rowCount).toBe(10);

    const positions = waitlistRows.rows.map((row) => Number(row.waitlist_position));
    expect(positions).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

    const uniqueUsers = new Set(waitlistRows.rows.map((row) => row.user_email));
    expect(uniqueUsers.size).toBe(10);
  });

  test("ensures no duplicate confirmed seats for a train/date", async () => {
    const trainId = getTestTrainId();
    await seedConfirmedTickets(5);

    const seatRows = await pool.query(
      `SELECT seat_no
       FROM tickets
       WHERE train_id = $1
         AND travel_date = $2
         AND status = 'CONFIRMED'
         AND seat_no IS NOT NULL`,
      [trainId, TEST_DATE]
    );

    const seats = seatRows.rows.map((row) => row.seat_no);
    const uniqueSeats = new Set(seats);

    expect(uniqueSeats.size).toBe(seats.length);
    expect(seats.length).toBe(5);
  });
});
