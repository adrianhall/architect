import type { CatalogData, DiagramEdge, DiagramNode } from "@architect/shared";
import type { Edge } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { fromReactFlowEdge, fromReactFlowNode, toReactFlowEdge, toReactFlowNode } from "../utils";

// ── Test fixtures ──────────────────────────────────────────────────────────────

/** Minimal catalog with one service in one category. */
const mockCatalog: CatalogData = {
	services: [
		{
			typeId: "workers",
			officialName: "Cloudflare Workers",
			shortName: "Workers",
			category: "developer-platform",
			iconPath: "workers.svg",
			docUrl: "https://developers.cloudflare.com/workers/",
		},
	],
	categories: [
		{
			id: "developer-platform",
			label: "Developer Platform",
			color: "#2563eb",
		},
	],
	edgeTypes: [],
};

const mockDiagramNode: DiagramNode = {
	id: "node-1",
	type: "workers",
	position: { x: 100, y: 200 },
	data: {
		label: "API Worker",
		description: "Handles routing",
		accentColor: undefined,
	},
};

const mockDiagramEdge: DiagramEdge = {
	id: "edge-1",
	source: "node-1",
	target: "node-2",
	sourceHandle: "right",
	targetHandle: "left",
	type: "binding",
	data: { label: "CACHE", protocol: "binding" },
};

// ── toReactFlowNode ────────────────────────────────────────────────────────────

describe("toReactFlowNode", () => {
	it("maps the node id, type=cloudflareService, and position", () => {
		const result = toReactFlowNode(mockDiagramNode, mockCatalog);
		expect(result.id).toBe("node-1");
		expect(result.type).toBe("cloudflareService");
		expect(result.position).toEqual({ x: 100, y: 200 });
	});

	it("copies label and description from diagram node data", () => {
		const result = toReactFlowNode(mockDiagramNode, mockCatalog);
		expect(result.data.label).toBe("API Worker");
		expect(result.data.description).toBe("Handles routing");
	});

	it("resolves the icon URL from the service catalog", () => {
		const result = toReactFlowNode(mockDiagramNode, mockCatalog);
		expect(result.data.iconUrl).toBe("/catalog/icons/workers.svg");
	});

	it("resolves the category color from the catalog", () => {
		const result = toReactFlowNode(mockDiagramNode, mockCatalog);
		expect(result.data.categoryColor).toBe("#2563eb");
	});

	it("preserves the serviceTypeId in node data", () => {
		const result = toReactFlowNode(mockDiagramNode, mockCatalog);
		expect(result.data.serviceTypeId).toBe("workers");
	});

	it("falls back to empty iconUrl when service not found in catalog", () => {
		const unknownNode: DiagramNode = { ...mockDiagramNode, type: "unknown-service" };
		const result = toReactFlowNode(unknownNode, mockCatalog);
		expect(result.data.iconUrl).toBe("");
	});

	it("falls back to gray #6b7280 when service not found in catalog", () => {
		const unknownNode: DiagramNode = { ...mockDiagramNode, type: "unknown-service" };
		const result = toReactFlowNode(unknownNode, mockCatalog);
		expect(result.data.categoryColor).toBe("#6b7280");
	});

	it("falls back to gray when the service has no matching category", () => {
		const catalogWithoutCategory: CatalogData = {
			...mockCatalog,
			categories: [], // category removed
		};
		const result = toReactFlowNode(mockDiagramNode, catalogWithoutCategory);
		expect(result.data.categoryColor).toBe("#6b7280");
	});
});

// ── toReactFlowEdge ────────────────────────────────────────────────────────────

describe("toReactFlowEdge", () => {
	it("maps all required fields", () => {
		const result = toReactFlowEdge(mockDiagramEdge);
		expect(result.id).toBe("edge-1");
		expect(result.source).toBe("node-1");
		expect(result.target).toBe("node-2");
	});

	it("preserves sourceHandle and targetHandle", () => {
		const result = toReactFlowEdge(mockDiagramEdge);
		expect(result.sourceHandle).toBe("right");
		expect(result.targetHandle).toBe("left");
	});

	it("preserves the type", () => {
		const result = toReactFlowEdge(mockDiagramEdge);
		expect(result.type).toBe("binding");
	});

	it("preserves edge data", () => {
		const result = toReactFlowEdge(mockDiagramEdge);
		expect(result.data).toEqual({ label: "CACHE", protocol: "binding" });
	});

	it("uses empty object for data when diagram edge has no data", () => {
		const edgeWithoutData: DiagramEdge = { ...mockDiagramEdge, data: undefined };
		const result = toReactFlowEdge(edgeWithoutData);
		expect(result.data).toEqual({});
	});
});

// ── fromReactFlowNode ──────────────────────────────────────────────────────────

describe("fromReactFlowNode", () => {
	it("round-trips a DiagramNode correctly", () => {
		const rfNode = toReactFlowNode(mockDiagramNode, mockCatalog);
		const result = fromReactFlowNode(rfNode);

		expect(result.id).toBe(mockDiagramNode.id);
		expect(result.type).toBe(mockDiagramNode.type);
		expect(result.position).toEqual(mockDiagramNode.position);
		expect(result.data.label).toBe(mockDiagramNode.data.label);
		expect(result.data.description).toBe(mockDiagramNode.data.description);
	});

	it("strips React Flow enrichment fields (iconUrl, categoryColor)", () => {
		const rfNode = toReactFlowNode(mockDiagramNode, mockCatalog);
		const result = fromReactFlowNode(rfNode) as unknown as Record<string, unknown>;
		expect(result.data).not.toHaveProperty("iconUrl");
		expect(result.data).not.toHaveProperty("categoryColor");
	});
});

// ── fromReactFlowEdge ──────────────────────────────────────────────────────────

describe("fromReactFlowEdge", () => {
	it("round-trips a DiagramEdge correctly", () => {
		const rfEdge = toReactFlowEdge(mockDiagramEdge);
		const result = fromReactFlowEdge(rfEdge);

		expect(result.id).toBe(mockDiagramEdge.id);
		expect(result.source).toBe(mockDiagramEdge.source);
		expect(result.target).toBe(mockDiagramEdge.target);
		expect(result.sourceHandle).toBe(mockDiagramEdge.sourceHandle);
		expect(result.targetHandle).toBe(mockDiagramEdge.targetHandle);
		expect(result.type).toBe(mockDiagramEdge.type);
	});

	it("converts null sourceHandle to undefined", () => {
		const rfEdge: Edge = { id: "e1", source: "n1", target: "n2", sourceHandle: null };
		const result = fromReactFlowEdge(rfEdge);
		expect(result.sourceHandle).toBeUndefined();
	});
});
