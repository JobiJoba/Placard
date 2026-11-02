import { describe, expect, it } from "@effect/vitest"
import { z } from "zod"
import { zodFromJsonSchema } from "./tools.ts"

describe("module tool schemas", () => {
  it("preserves required nested arrays and item descriptions for MCP discovery", () => {
    const schema = {
      type: "object",
      required: ["menu"],
      properties: {
        menu: {
          type: "object",
          required: ["items"],
          properties: {
            items: {
              type: "array",
              items: {
                type: "object",
                required: ["name"],
                properties: { name: { type: "string", description: "Dish name" } },
              },
            },
          },
        },
      },
    }
    const converted = z.object(zodFromJsonSchema(schema))
    expect(converted.safeParse({}).success).toBe(false)
    expect(converted.safeParse({ menu: { items: [{ name: "Soup" }] } }).success).toBe(true)
    expect(converted.safeParse({ menu: { items: [{ name: 4 }] } }).success).toBe(false)
    expect(JSON.stringify(z.toJSONSchema(converted))).toContain("Dish name")
  })
})
