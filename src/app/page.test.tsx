import { render, screen } from "@testing-library/react";
import Page from "./page";

it("renders the ATQA promise", () => {
  render(<Page />);
  expect(
    screen.getByRole("heading", { name: "音声を、聴くべき場所だけに。" }),
  ).toBeInTheDocument();
});
