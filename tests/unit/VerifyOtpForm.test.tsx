import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VerifyOtpForm } from "@/app/_components/VerifyOtpForm";

describe("VerifyOtpForm", () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    }) as jest.Mock;
  });

  afterEach(() => {
    (global.fetch as jest.Mock).mockReset();
  });

  it("renders a code input", () => {
    render(<VerifyOtpForm email="x@example.com" type="invite" />);
    expect(screen.getByLabelText(/code/i)).toBeInTheDocument();
  });

  it("submits the code with the correct body", async () => {
    const user = userEvent.setup();
    render(<VerifyOtpForm email="x@example.com" type="invite" />);
    await user.type(screen.getByLabelText(/code/i), "123456");
    await user.click(screen.getByRole("button", { name: /verify/i }));
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/auth/verify",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          email: "x@example.com",
          token: "123456",
          type: "invite",
        }),
      })
    );
  });

  it("shows an error when the API returns an error", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Token has expired or is invalid" }),
    });
    const user = userEvent.setup();
    render(<VerifyOtpForm email="x@example.com" type="email" />);
    await user.type(screen.getByLabelText(/code/i), "000000");
    await user.click(screen.getByRole("button", { name: /verify/i }));
    expect(
      await screen.findByText(/token has expired or is invalid/i)
    ).toBeInTheDocument();
  });
});
