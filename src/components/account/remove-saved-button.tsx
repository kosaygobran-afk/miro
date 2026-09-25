"use client";

export function RemoveSavedButton({
  productId,
  label,
}: {
  productId: string;
  label: string;
}) {
  return (
    <button
      type="button"
      className="miro-button miro-button-secondary text-xs"
      onClick={async () => {
        try {
          await fetch(
            `/api/account/saved-products?productId=${encodeURIComponent(productId)}`,
            { method: "DELETE" },
          );
          window.location.reload();
        } catch (error) {
          console.error("Failed to remove saved product", error);
        }
      }}
    >
      {label}
    </button>
  );
}
