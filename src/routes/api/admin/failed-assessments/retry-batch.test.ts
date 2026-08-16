/// <reference lib="deno.ns" />

Deno.test("retry-batch validation - accepts valid ids array", () => {
  const validateBody = (body: { ids?: unknown }): { valid: boolean; error?: string } => {
    if (!body.ids || !Array.isArray(body.ids)) {
      return { valid: false, error: "ids must be an array" };
    }
    if (body.ids.length > 100) {
      return { valid: false, error: "max 100 ids per batch" };
    }
    return { valid: true };
  };

  const result1 = validateBody({ ids: ["id1", "id2"] });
  if (!result1.valid) {
    throw new Error("Should accept valid ids array");
  }

  const result2 = validateBody({ ids: Array(100).fill("id") });
  if (!result2.valid) {
    throw new Error("Should accept exactly 100 ids");
  }
});

Deno.test("retry-batch validation - rejects invalid ids array", () => {
  const validateBody = (body: { ids?: unknown }): { valid: boolean; error?: string } => {
    if (!body.ids || !Array.isArray(body.ids)) {
      return { valid: false, error: "ids must be an array" };
    }
    if (body.ids.length > 100) {
      return { valid: false, error: "max 100 ids per batch" };
    }
    return { valid: true };
  };

  const result1 = validateBody({});
  if (result1.valid || result1.error !== "ids must be an array") {
    throw new Error("Should reject missing ids");
  }

  const result2 = validateBody({ ids: null });
  if (result2.valid || result2.error !== "ids must be an array") {
    throw new Error("Should reject null ids");
  }

  const result3 = validateBody({ ids: "not-an-array" });
  if (result3.valid || result3.error !== "ids must be an array") {
    throw new Error("Should reject string ids");
  }

  const result4 = validateBody({ ids: Array(101).fill("id") });
  if (result4.valid || result4.error !== "max 100 ids per batch") {
    throw new Error("Should reject more than 100 ids");
  }
});
