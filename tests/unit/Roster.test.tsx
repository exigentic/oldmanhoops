import { render, screen } from "@testing-library/react";
import { Roster } from "@/app/_components/Roster";
import type { RosterEntry } from "@/lib/scoreboard";

describe("Roster", () => {
  const entries: RosterEntry[] = [
    { playerId: "p-alice", name: "Alice", status: "in", guests: 1, note: "15 min late" },
    { playerId: "p-bob", name: "Bob", status: "in", guests: 0, note: null },
    { playerId: "p-cat", name: "Cat", status: "maybe", guests: 0, note: null },
    { playerId: "p-dave", name: "Dave", status: "out", guests: 0, note: null },
  ];

  it("groups entries by status", () => {
    render(<Roster entries={entries} />);
    expect(screen.getByRole("heading", { name: /^in/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^maybe/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^out/i })).toBeInTheDocument();
  });

  it("shows guest count next to the name when > 0", () => {
    render(<Roster entries={entries} />);
    expect(screen.getByText(/alice/i)).toHaveTextContent("+1");
  });

  it("shows the note", () => {
    render(<Roster entries={entries} />);
    expect(screen.getByText(/15 min late/i)).toBeInTheDocument();
  });

  it("renders nothing when entries are empty", () => {
    render(<Roster entries={[]} />);
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });
});
