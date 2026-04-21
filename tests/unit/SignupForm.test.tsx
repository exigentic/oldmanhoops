import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SignupForm } from "@/app/join/SignupForm";

describe("SignupForm", () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    }) as jest.Mock;
  });

  afterEach(() => {
    (global.fetch as jest.Mock).mockReset();
  });

  it("renders name, email, and code inputs", () => {
    render(<SignupForm initialCode="" />);
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/access code/i)).toBeInTheDocument();
  });

  it("pre-fills the access code from props", () => {
    render(<SignupForm initialCode="prefilled-code" />);
    expect(screen.getByLabelText(/access code/i)).toHaveValue("prefilled-code");
  });

  it("submits the form and shows a success message", async () => {
    const user = userEvent.setup();
    render(<SignupForm initialCode="" />);
    await user.type(screen.getByLabelText(/name/i), "New Player");
    await user.type(screen.getByLabelText(/email/i), "new@example.com");
    await user.type(screen.getByLabelText(/access code/i), "the-code");
    await user.click(screen.getByRole("button", { name: /sign up/i }));
    expect(await screen.findByText(/check your email/i)).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/auth/signup",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("shows an error message when the API returns an error", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Invalid signup code" }),
    });
    const user = userEvent.setup();
    render(<SignupForm initialCode="" />);
    await user.type(screen.getByLabelText(/name/i), "X");
    await user.type(screen.getByLabelText(/email/i), "x@example.com");
    await user.type(screen.getByLabelText(/access code/i), "wrong");
    await user.click(screen.getByRole("button", { name: /sign up/i }));
    expect(await screen.findByText(/invalid signup code/i)).toBeInTheDocument();
  });

  it("renders an optional phone input", () => {
    render(<SignupForm initialCode="" />);
    expect(screen.getByLabelText(/phone/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/phone/i)).not.toBeRequired();
  });

  it("omits phone from the request body when left blank", async () => {
    const user = userEvent.setup();
    render(<SignupForm initialCode="" />);
    await user.type(screen.getByLabelText(/name/i), "No Phone");
    await user.type(screen.getByLabelText(/email/i), "nop@example.com");
    await user.type(screen.getByLabelText(/access code/i), "the-code");
    await user.click(screen.getByRole("button", { name: /sign up/i }));
    const call = (global.fetch as jest.Mock).mock.calls.find(
      (c) => c[0] === "/api/auth/signup"
    );
    expect(call).toBeDefined();
    const sent = JSON.parse(call![1].body);
    expect(sent).not.toHaveProperty("phone");
  });

  it("includes the raw phone string in the request body when filled", async () => {
    const user = userEvent.setup();
    render(<SignupForm initialCode="" />);
    await user.type(screen.getByLabelText(/name/i), "With Phone");
    await user.type(screen.getByLabelText(/email/i), "wp@example.com");
    await user.type(screen.getByLabelText(/phone/i), "(555) 123-4567");
    await user.type(screen.getByLabelText(/access code/i), "the-code");
    await user.click(screen.getByRole("button", { name: /sign up/i }));
    const call = (global.fetch as jest.Mock).mock.calls.find(
      (c) => c[0] === "/api/auth/signup"
    );
    expect(call).toBeDefined();
    const sent = JSON.parse(call![1].body);
    expect(sent.phone).toBe("(555) 123-4567");
  });
});
