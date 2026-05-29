import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { Editor } from "../Editor";

describe("Editor", () => {
	it("renders the heading with the diagram id from route params", () => {
		render(
			<MemoryRouter initialEntries={["/editor/test-123"]}>
				<Routes>
					<Route path="/editor/:id" element={<Editor />} />
				</Routes>
			</MemoryRouter>,
		);

		expect(screen.getByRole("heading", { name: "Editor for diagram test-123" })).toBeInTheDocument();
	});
});
