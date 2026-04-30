import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RsvpControls } from "@/app/_components/RsvpControls";

const ZERO_COUNTS = { in: 0, out: 0, maybe: 0 };

describe("RsvpControls", () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    }) as jest.Mock;
  });

  afterEach(() => {
    (global.fetch as jest.Mock).mockReset();
  });

  it("renders In / Out / Maybe count cards as buttons", () => {
    render(<RsvpControls counts={ZERO_COUNTS} current={null} viewDate="2026-04-30" />);
    // Count cards are rendered as buttons when onSelect is wired
    expect(screen.getAllByRole("button")).toHaveLength(5); // 3 cards + 2 guest steppers
  });

  it("marks the current status card as pressed", () => {
    render(<RsvpControls counts={ZERO_COUNTS} current={{ status: "in", guests: 0, note: null }} viewDate="2026-04-30" />);
    const inCard = screen.getByLabelText(/in count/i).closest("button");
    expect(inCard).toHaveAttribute("aria-pressed", "true");
  });

  it("shows the current guest count and note", () => {
    render(<RsvpControls counts={ZERO_COUNTS} current={{ status: "in", guests: 2, note: "hello" }} viewDate="2026-04-30" />);
    expect(screen.getByLabelText(/2 guests/i)).toHaveTextContent("2");
    expect(screen.getByLabelText(/^note$/i)).toHaveValue("hello");
  });

  it("submits the RSVP when a status card is clicked", async () => {
    const user = userEvent.setup();
    render(<RsvpControls counts={ZERO_COUNTS} current={null} viewDate="2026-04-30" />);
    const inCard = screen.getByLabelText(/in count/i).closest("button")!;
    await user.click(inCard);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/rsvp",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("disables decrement button at guests=0", () => {
    render(<RsvpControls counts={ZERO_COUNTS} current={{ status: "in", guests: 0, note: null }} viewDate="2026-04-30" />);
    const minus = screen.getByRole("button", { name: /decrement/i });
    expect(minus).toBeDisabled();
  });

  it("calls onUpdated after a successful submit", async () => {
    const onUpdated = jest.fn();
    const user = userEvent.setup();
    render(<RsvpControls counts={ZERO_COUNTS} current={null} viewDate="2026-04-30" onUpdated={onUpdated} />);
    const inCard = screen.getByLabelText(/in count/i).closest("button")!;
    await user.click(inCard);
    expect(onUpdated).toHaveBeenCalled();
  });

  it("shows 'Saved ✓' after the note is saved on blur", async () => {
    const user = userEvent.setup();
    render(<RsvpControls counts={ZERO_COUNTS} current={{ status: "in", guests: 0, note: "" }} viewDate="2026-04-30" />);
    const note = screen.getByLabelText(/^note$/i);
    await user.click(note);
    await user.keyboard("hello");
    await user.tab();
    expect(await screen.findByText(/saved ✓/i)).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/rsvp",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("does not save the note when it hasn't changed", async () => {
    const user = userEvent.setup();
    render(<RsvpControls counts={ZERO_COUNTS} current={{ status: "in", guests: 0, note: "original" }} viewDate="2026-04-30" />);
    const note = screen.getByLabelText(/^note$/i);
    await user.click(note);
    await user.tab();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.queryByText(/saved ✓/i)).not.toBeInTheDocument();
  });
});
