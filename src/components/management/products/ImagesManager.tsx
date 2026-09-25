"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import { Plus, Trash2, GripVertical, Edit2 } from "lucide-react";

type ProductImage = {
  id: string;
  product_id: string;
  image_url: string;
  alt_he: string | null;
  alt_en: string | null;
  sort_order: number;
};

export function ImagesManager({
  locale,
  productId,
  initialImages,
  onImagesChange,
  disabled,
}: {
  locale: "he" | "en";
  productId: string;
  initialImages: ProductImage[];
  onImagesChange: (images: ProductImage[]) => void;
  disabled?: boolean;
}) {
  const he = locale === "he";
  const [images, setImages] = useState<ProductImage[]>(initialImages);
  const [newImageUrl, setNewImageUrl] = useState("");
  const [editingImageId, setEditingImageId] = useState<string | null>(null);
  const [editAltHe, setEditAltHe] = useState("");
  const [editAltEn, setEditAltEn] = useState("");

  const loadImages = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/management/product-images?productId=${productId}`,
        {
          cache: "no-store",
        },
      );
      if (response.ok) {
        const { images: imagesData } = await response.json();
        setImages(imagesData);
        onImagesChange(imagesData);
      }
    } catch (err) {
      console.error("Failed to load images", err);
    }
  }, [productId, onImagesChange]);

  const addImage = async () => {
    if (!newImageUrl.trim() || disabled) return;
    try {
      const response = await fetch("/api/management/product-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: productId,
          image_url: newImageUrl.trim(),
        }),
      });
      if (!response.ok) throw new Error("Failed to add image");
      const { image } = await response.json();
      setImages((prev) => [...prev, image]);
      onImagesChange([...images, image]);
      setNewImageUrl("");
    } catch (err) {
      console.error("Failed to add image", err);
    }
  };

  const updateImage = async (id: string, alt_he: string, alt_en: string) => {
    if (disabled) return;
    try {
      const response = await fetch("/api/management/product-images", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, alt_he, alt_en }),
      });
      if (!response.ok) throw new Error("Failed to update image");
      const { image } = await response.json();
      setImages((prev) => prev.map((img) => (img.id === id ? image : img)));
      onImagesChange(images.map((img) => (img.id === id ? image : img)));
      setEditingImageId(null);
    } catch (err) {
      console.error("Failed to update image", err);
    }
  };

  const deleteImage = async (id: string) => {
    if (disabled) return;
    try {
      const response = await fetch(`/api/management/product-images?id=${id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete image");
      setImages((prev) => prev.filter((img) => img.id !== id));
      onImagesChange(images.filter((img) => img.id !== id));
    } catch (err) {
      console.error("Failed to delete image", err);
    }
  };

  const startEdit = (img: ProductImage) => {
    setEditingImageId(img.id);
    setEditAltHe(img.alt_he ?? "");
    setEditAltEn(img.alt_en ?? "");
  };

  const cancelEdit = () => {
    setEditingImageId(null);
    setEditAltHe("");
    setEditAltEn("");
  };

  const reorderImages = async (newOrder: ProductImage[]) => {
    if (disabled) return;
    try {
      const updates = newOrder.map((img, index) =>
        fetch("/api/management/product-images", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: img.id, sort_order: index }),
        }),
      );
      await Promise.all(updates);
      loadImages();
    } catch (err) {
      console.error("Failed to reorder images", err);
    }
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.setData("text/plain", index.toString());
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    const sourceIndex = Number(e.dataTransfer.getData("text/plain"));
    if (sourceIndex === targetIndex) return;
    const newImages = [...images];
    const [removed] = newImages.splice(sourceIndex, 1);
    newImages.splice(targetIndex, 0, removed);
    setImages(newImages);
    reorderImages(newImages);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium">
          {he ? "תמונות מוצר" : "Product Images"}
        </label>
        {!disabled && (
          <div className="flex gap-2">
            <input
              type="url"
              value={newImageUrl}
              onChange={(e) => setNewImageUrl(e.target.value)}
              className="miro-input flex-1 max-w-xs"
              placeholder="https://example.com/image.jpg"
              disabled={disabled}
              aria-label={he ? "כתובת תמונה" : "Image URL"}
            />
            <button
              type="button"
              className="miro-button miro-button-primary"
              onClick={addImage}
              disabled={disabled || !newImageUrl.trim()}
              aria-label={he ? "הוסף תמונה" : "Add image"}
            >
              <Plus className="mr-1 h-4 w-4" />
              {he ? "הוסף" : "Add"}
            </button>
          </div>
        )}
      </div>

      {images.length === 0 ? (
        <div className="miro-card p-8 text-center border-dashed border-border-subtle">
          <p className="text-muted-foreground">
            {he
              ? "אין תמונות עדיין. הוסף תמונה ראשונה למעלה."
              : "No images yet. Add the first image above."}
          </p>
        </div>
      ) : (
        <div
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          role="list"
          aria-label={he ? "תמונות מוצר" : "Product images"}
        >
          {images.map((img, index) => (
            <article
              key={img.id}
              className="miro-card relative group"
              role="listitem"
              draggable={!disabled}
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, index)}
            >
              <div className="relative aspect-video w-full overflow-hidden rounded-lg">
                <Image
                  src={img.image_url}
                  alt={he ? (img.alt_he ?? "") : (img.alt_en ?? "")}
                  fill
                  className="object-cover transition-transform duration-200 group-hover:scale-105"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                />
              </div>

              {editingImageId === img.id ? (
                <div className="mt-3 space-y-2 p-2 bg-surface-muted rounded-lg border border-border-subtle">
                  <div>
                    <label className="block text-xs font-medium mb-1">
                      {he ? "טקסט חלופי (עברית)" : "Alt text (Hebrew)"}
                    </label>
                    <input
                      type="text"
                      value={editAltHe}
                      onChange={(e) => setEditAltHe(e.target.value)}
                      className="miro-input text-sm"
                      maxLength={300}
                      placeholder={
                        he
                          ? "תיאור התמונה בעברית"
                          : "Image description in Hebrew"
                      }
                      aria-label={he ? "טקסט חלופי עברית" : "Alt text Hebrew"}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">
                      {he ? "טקסט חלופי (אנגלית)" : "Alt text (English)"}
                    </label>
                    <input
                      type="text"
                      value={editAltEn}
                      onChange={(e) => setEditAltEn(e.target.value)}
                      className="miro-input text-sm"
                      maxLength={300}
                      placeholder={
                        he
                          ? "תיאור התמונה באנגלית"
                          : "Image description in English"
                      }
                      aria-label={he ? "טקסט חלופי אנגלית" : "Alt text English"}
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="miro-button miro-button-primary text-sm flex-1"
                      onClick={() => updateImage(img.id, editAltHe, editAltEn)}
                    >
                      {he ? "שמור" : "Save"}
                    </button>
                    <button
                      type="button"
                      className="miro-button miro-button-secondary text-sm flex-1"
                      onClick={cancelEdit}
                    >
                      {he ? "ביטול" : "Cancel"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="font-mono">#{index + 1}</span>
                    {img.alt_he && (
                      <span className="max-w-[120px] truncate">
                        {img.alt_he}
                      </span>
                    )}
                    {img.alt_en && (
                      <span className="max-w-[120px] truncate">
                        {img.alt_en}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {!disabled && (
                      <button
                        type="button"
                        className="miro-button miro-button-secondary text-sm p-2"
                        onClick={() => startEdit(img)}
                        aria-label={he ? "ערוך טקסט חלופי" : "Edit alt text"}
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                    )}
                    {!disabled && (
                      <button
                        type="button"
                        className="miro-button miro-button-secondary text-sm p-2 text-destructive hover:bg-destructive/10"
                        onClick={() => deleteImage(img.id)}
                        aria-label={he ? "מחק תמונה" : "Delete image"}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                    {!disabled && (
                      <GripVertical
                        className="h-5 w-5 text-muted-foreground cursor-grab opacity-0 group-hover:opacity-100"
                        aria-label={he ? "גרור לסידור" : "Drag to reorder"}
                      />
                    )}
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
