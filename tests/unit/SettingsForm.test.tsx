import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsForm } from "@/app/settings/SettingsForm";

const BASE = {
  initialName: "Jordan",
  initialEmail: "jordan@example.com",
  initialPhone: null as string | null,
  initialReminderEmail: true,
  initialActive: true,
  pendingEmail: null as string | null,
};

describe("SettingsForm", () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    }) as jest.Mock;
  });

  afterEach(() => {
    (global.fetch as jest.Mock).mockReset();
  });

  it("pre-fills name, email, and toggles from props", () => {
    render(<SettingsForm {...BASE} />);
    expect(screen.getByLabelText(/display name/i)).toHaveValue("Jordan");
    expect(screen.getByLabelText("Email")).toHaveValue("jordan@example.com");
    expect(screen.getByLabelText(/email reminders/i)).toBeChecked();
    expect(screen.getByLabelText(/active/i)).toBeChecked();
  });

  it("POSTs { name } to /api/profile when save name clicked", async () => {
    const user = userEvent.setup();
    render(<SettingsForm {...BASE} />);
    const input = screen.getByLabelText(/display name/i);
    await user.clear(input);
    await user.type(input, "Newname");
    await user.click(screen.getByRole("button", { name: /save name/i }));
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/profile",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "Newname" }),
      })
    );
  });

  it("POSTs { email } to /api/auth/email when Send confirmation clicked", async () => {
    const user = userEvent.setup();
    render(<SettingsForm {...BASE} />);
    const input = screen.getByLabelText("Email");
    await user.clear(input);
    await user.type(input, "new@example.com");
    await user.click(screen.getByRole("button", { name: /send confirmation/i }));
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/auth/email",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "new@example.com" }),
      })
    );
  });

  it("toggling email reminders auto-POSTs to /api/profile", async () => {
    const user = userEvent.setup();
    render(<SettingsForm {...BASE} />);
    await user.click(screen.getByLabelText(/email reminders/i));
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/profile",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ reminder_email: false }),
      })
    );
  });

  it("toggling active auto-POSTs to /api/profile", async () => {
    const user = userEvent.setup();
    render(<SettingsForm {...BASE} />);
    await user.click(screen.getByLabelText(/active/i));
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/profile",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ active: false }),
      })
    );
  });

  it("shows pending-email banner when pendingEmail is provided", () => {
    render(<SettingsForm {...BASE} pendingEmail="new@example.com" />);
    expect(screen.getByText(/check your inbox at new@example.com/i)).toBeInTheDocument();
  });

  it("shows pending-email banner after successful email submit", async () => {
    const user = userEvent.setup();
    render(<SettingsForm {...BASE} />);
    const input = screen.getByLabelText("Email");
    await user.clear(input);
    await user.type(input, "fresh@example.com");
    await user.click(screen.getByRole("button", { name: /send confirmation/i }));
    expect(
      await screen.findByText(/check your inbox at fresh@example.com/i)
    ).toBeInTheDocument();
  });

  it("trims whitespace from the name before submitting", async () => {
    const user = userEvent.setup();
    render(<SettingsForm {...BASE} />);
    const input = screen.getByLabelText(/display name/i);
    await user.clear(input);
    await user.type(input, "  Jordan  ");
    await user.click(screen.getByRole("button", { name: /save name/i }));
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/profile",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "Jordan" }),
      })
    );
    expect(input).toHaveValue("Jordan");
  });

  it("disables Send confirmation button when the email matches pendingEmail", async () => {
    render(<SettingsForm {...BASE} pendingEmail="pending@example.com" />);
    const input = screen.getByLabelText("Email");
    await userEvent.setup().clear(input);
    await userEvent.setup().type(input, "pending@example.com");
    expect(screen.getByRole("button", { name: /send confirmation/i })).toBeDisabled();
  });

  it("reverts the toggle when the server rejects the update", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "nope" }),
    });
    const user = userEvent.setup();
    render(<SettingsForm {...BASE} />);
    const cb = screen.getByLabelText(/email reminders/i);
    expect(cb).toBeChecked();
    await user.click(cb);
    // After the failed POST resolves, the checkbox should be back to checked
    await screen.findByRole("alert");
    expect(cb).toBeChecked();
  });

  it("pre-fills phone from initialPhone", () => {
    render(<SettingsForm {...BASE} initialPhone="5551234567" />);
    expect(screen.getByLabelText(/^Phone$/i)).toHaveValue("5551234567");
  });

  it("shows empty phone input when initialPhone is null", () => {
    render(<SettingsForm {...BASE} />);
    expect(screen.getByLabelText(/^Phone$/i)).toHaveValue("");
  });

  it("POSTs normalized-entry phone to /api/profile when Save phone clicked", async () => {
    const user = userEvent.setup();
    render(<SettingsForm {...BASE} />);
    const input = screen.getByLabelText(/^Phone$/i);
    await user.type(input, "(555) 123-4567");
    await user.click(screen.getByRole("button", { name: /save phone/i }));
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/profile",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ phone: "(555) 123-4567" }),
      })
    );
  });

  it("POSTs { phone: null } when saving an empty phone input", async () => {
    const user = userEvent.setup();
    render(<SettingsForm {...BASE} initialPhone="5551234567" />);
    const input = screen.getByLabelText(/^Phone$/i);
    await user.clear(input);
    await user.click(screen.getByRole("button", { name: /save phone/i }));
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/profile",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ phone: null }),
      })
    );
  });

  it("disables Save phone button when the input matches the last saved value", () => {
    render(<SettingsForm {...BASE} initialPhone="5551234567" />);
    expect(screen.getByRole("button", { name: /save phone/i })).toBeDisabled();
  });

  it("shows the server error when phone save fails", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Phone must be 10–15 digits" }),
    });
    const user = userEvent.setup();
    render(<SettingsForm {...BASE} />);
    await user.type(screen.getByLabelText(/^Phone$/i), "bad");
    await user.click(screen.getByRole("button", { name: /save phone/i }));
    expect(await screen.findByText(/10.?15 digits/i)).toBeInTheDocument();
  });
});
