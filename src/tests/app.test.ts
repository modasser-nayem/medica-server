import request from "supertest";
import app from "../app";

describe("GET /health", () => {
  it("should return 200 and message", async () => {
    const res = await request(app).get("/health");
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("Server Health is Ok");
  });
});
