import { render, screen } from "@testing-library/react";
import { CountCards } from "@/app/_components/CountCards";

describe("CountCards", () => {
  it("renders the three counts", () => {
    render(<CountCards counts={{ in: 5, out: 2, maybe: 1 }} />);
    expect(screen.getByLabelText(/in count/i)).toHaveTextContent("5");
    expect(screen.getByLabelText(/out count/i)).toHaveTextContent("2");
    expect(screen.getByLabelText(/maybe count/i)).toHaveTextContent("1");
  });

  it("shows zero counts without error", () => {
    render(<CountCards counts={{ in: 0, out: 0, maybe: 0 }} />);
    expect(screen.getByLabelText(/in count/i)).toHaveTextContent("0");
  });
});
