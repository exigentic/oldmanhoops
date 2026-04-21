/** @jest-environment node */
const verifyOtp = jest.fn();

jest.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { verifyOtp } }),
}));

import { GET } from "@/app/auth/confirm/route";

function makeRequest(search: string) {
  return new Request(`http://localhost/auth/confirm${search}`);
}

describe("GET /auth/confirm", () => {
  beforeEach(() => {
    verifyOtp.mockReset();
  });

  it("redirects to the error page when token_hash is missing", async () => {
    const res = await GET(makeRequest("?type=magiclink"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "http://localhost/login?error=invalid-link"
    );
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("redirects to the error page when type is missing", async () => {
    const res = await GET(makeRequest("?token_hash=abc"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "http://localhost/login?error=invalid-link"
    );
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("verifies the OTP and redirects to `/` by default", async () => {
    verifyOtp.mockResolvedValueOnce({ error: null });

    const res = await GET(makeRequest("?token_hash=abc&type=magiclink"));

    expect(verifyOtp).toHaveBeenCalledWith({
      type: "magiclink",
      token_hash: "abc",
    });
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/");
  });

  it("redirects to the `next` param after a successful verify", async () => {
    verifyOtp.mockResolvedValueOnce({ error: null });

    const res = await GET(
      makeRequest("?token_hash=abc&type=invite&next=/settings")
    );

    expect(res.headers.get("location")).toBe("http://localhost/settings");
  });

  it("redirects to the error page when verifyOtp returns an error", async () => {
    verifyOtp.mockResolvedValueOnce({ error: { message: "expired" } });

    const res = await GET(makeRequest("?token_hash=abc&type=magiclink"));

    expect(res.headers.get("location")).toBe(
      "http://localhost/login?error=invalid-link"
    );
  });
});
