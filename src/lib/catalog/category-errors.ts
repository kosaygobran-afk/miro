/** Safe, actionable catalog hierarchy errors; raw database details stay private. */
export function getCategoryWriteError(error: {
  code?: string;
  message?: string;
}) {
  const message = error.message ?? "";
  if (
    error.code === "23505" &&
    message.includes("categories_root_route_key_unique")
  ) {
    return {
      status: 409,
      body: { error: "duplicate_slug", code: "duplicate_slug" },
    };
  }
  if (error.code !== "22023") return null;
  if (message.includes("External category is required")) {
    return {
      status: 400,
      body: {
        error: "External category is required",
        code: "category_required",
      },
    };
  }
  if (
    message.includes(
      "Internal category must belong to the selected external category",
    )
  ) {
    return {
      status: 400,
      body: {
        error:
          "Internal category must belong to the selected external category",
        code: "subcategory_mismatch",
      },
    };
  }
  if (message.includes("Category is in use;")) {
    return {
      status: 409,
      body: {
        error:
          "Reassign products and internal categories before changing or deleting this category",
        code: "category_in_use",
      },
    };
  }
  if (
    [
      "Product category must be an external category",
      "Parent category not found",
      "Category cannot be its own parent",
      "Internal categories must belong directly to an external category",
      "Category parent cycle detected",
    ].some((reason) => message.includes(reason))
  ) {
    return {
      status: 400,
      body: {
        error: "Choose a valid external category",
        code: "invalid_category",
      },
    };
  }
  return null;
}
