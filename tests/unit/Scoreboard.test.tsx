import { render, screen } from "@testing-library/react";
import { Scoreboard } from "@/app/_components/Scoreboard";
import type { ScoreboardData } from "@/lib/scoreboard";

describe("Scoreboard", () => {
  afterEach(() => {
    (global.fetch as jest.Mock | undefined)?.mockReset?.();
  });

  it("renders 'No game today' for no-game state", () => {
    render(<Scoreboard initial={{ state: "no-game" }} />);
    expect(screen.getByText(/no game today/i)).toBeInTheDocument();
  });

  it("renders the cancellation reason for cancelled state", () => {
    render(<Scoreboard initial={{ state: "cancelled", reason: "Gym closed" }} />);
    expect(screen.getByText(/gym closed/i)).toBeInTheDocument();
  });

  it("renders counts for scheduled state without a roster", () => {
    const initial: ScoreboardData = {
      state: "scheduled",
      counts: { in: 4, out: 1, maybe: 2 },
      roster: null,
      currentUserRsvp: null,
    };
    render(<Scoreboard initial={initial} />);
    expect(screen.getByLabelText(/in count/i)).toHaveTextContent("4");
    // No roster means no headings
    expect(screen.queryByRole("heading", { name: /^in/i })).not.toBeInTheDocument();
  });

  it("renders counts + roster for scheduled member view", () => {
    const initial: ScoreboardData = {
      state: "scheduled",
      counts: { in: 1, out: 0, maybe: 0 },
      roster: [{ name: "Alice", status: "in", guests: 0, note: null }],
      currentUserRsvp: null,
    };
    render(<Scoreboard initial={initial} />);
    expect(screen.getByLabelText(/in count/i)).toHaveTextContent("1");
    expect(screen.getByText(/alice/i)).toBeInTheDocument();
  });
});
