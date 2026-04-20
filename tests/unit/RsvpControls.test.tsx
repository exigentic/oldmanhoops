import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RsvpControls } from "@/app/_components/RsvpControls";

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

  it("renders In / Out / Maybe buttons", () => {
    render(<RsvpControls current={null} />);
    expect(screen.getByRole("button", { name: /^in$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^out$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^maybe$/i })).toBeInTheDocument();
  });

  it("highlights the current status", () => {
    render(<RsvpControls current={{ status: "in", guests: 0, note: null }} />);
    const inBtn = screen.getByRole("button", { name: /^in$/i });
    expect(inBtn).toHaveAttribute("aria-pressed", "true");
  });

  it("shows the current guest count and note", () => {
    render(<RsvpControls current={{ status: "in", guests: 2, note: "hello" }} />);
    expect(screen.getByLabelText(/^guests$/i)).toHaveTextContent("2");
    expect(screen.getByLabelText(/^note$/i)).toHaveValue("hello");
  });

  it("submits the RSVP when a status button is clicked", async () => {
    const user = userEvent.setup();
    render(<RsvpControls current={null} />);
    await user.click(screen.getByRole("button", { name: /^in$/i }));
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/rsvp",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("disables decrement button at guests=0", () => {
    render(<RsvpControls current={{ status: "in", guests: 0, note: null }} />);
    const minus = screen.getByRole("button", { name: /decrement/i });
    expect(minus).toBeDisabled();
  });

  it("calls onUpdated after a successful submit", async () => {
    const onUpdated = jest.fn();
    const user = userEvent.setup();
    render(<RsvpControls current={null} onUpdated={onUpdated} />);
    await user.click(screen.getByRole("button", { name: /^in$/i }));
    expect(onUpdated).toHaveBeenCalled();
  });
});
