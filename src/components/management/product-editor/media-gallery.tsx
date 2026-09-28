"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import {
  ArrowDown,
  ArrowUp,
  ImageIcon,
  Loader2,
  Pencil,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import {
  ConfirmationDialog,
  Dialog,
  EmptyState,
  FormField,
  ListSkeleton,
  Notice,
} from "../ui";
import { editorCopy, mediaCopy } from "./copy";
import type { Locale, ProductImage } from "./types";
import styles from "./product-editor.module.css";

type UploadItem = {
  key: string;
  name: string;
  progress: number;
  error: string | null;
};

function uploadFile(
  file: File,
  productId: string,
  sortOrder: number,
  isPrimary: boolean,
  onProgress: (ratio: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/management/product-images/upload");
    xhr.responseType = "json";
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(event.loaded / event.total);
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      const body = xhr.response as { error?: string } | null;
      reject(new Error(body?.error ?? "Upload failed"));
    };
    xhr.onerror = () => reject(new Error("Upload failed"));

    const form = new FormData();
    form.append("file", file);
    form.append("product_id", productId);
    form.append("sort_order", String(sortOrder));
    if (isPrimary) form.append("is_primary", "true");
    xhr.send(form);
  });
}

export function MediaGallery({
  locale,
  productId,
}: {
  locale: Locale;
  productId: string;
}) {
  const he = locale === "he";
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [images, setImages] = useState<ProductImage[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ProductImage | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [altEdit, setAltEdit] = useState<ProductImage | null>(null);
  const [altHe, setAltHe] = useState("");
  const [altEn, setAltEn] = useState("");
  const [altSaving, setAltSaving] = useState(false);
  const [altError, setAltError] = useState("");

  const loadImages = useCallback(async () => {
    setError("");
    try {
      const response = await fetch(
        `/api/management/product-images?productId=${productId}`,
        { cache: "no-store" },
      );
      if (!response.ok) {
        setError(mediaCopy.imageOperationFailed[locale]);
        setImages([]);
        return;
      }
      const data = (await response.json()) as { images?: ProductImage[] };
      setImages(data.images ?? []);
    } catch {
      setError(mediaCopy.imageOperationFailed[locale]);
      setImages([]);
    }
  }, [productId, locale]);

  useEffect(() => {
    void loadImages();
  }, [loadImages]);

  async function handleFilesSelected(fileList: FileList | null) {
    if (!fileList || fileList.length === 0 || images === null) return;
    setNotice("");
    const files = Array.from(fileList);
    const nextSort =
      images.reduce((max, img) => Math.max(max, img.sort_order), -1) + 1;
    const batch: UploadItem[] = files.map((file, index) => ({
      key: `${Date.now()}-${index}-${file.name}`,
      name: file.name,
      progress: 0,
      error: null,
    }));
    setUploads((prev) => [...prev, ...batch]);

    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      const item = batch[i];
      try {
        await uploadFile(
          file,
          productId,
          nextSort + i,
          images.length === 0 && i === 0,
          (ratio) => {
            setUploads((prev) =>
              prev.map((u) =>
                u.key === item.key ? { ...u, progress: ratio } : u,
              ),
            );
          },
        );
        setUploads((prev) => prev.filter((u) => u.key !== item.key));
      } catch (err) {
        setUploads((prev) =>
          prev.map((u) =>
            u.key === item.key
              ? {
                  ...u,
                  progress: 0,
                  error:
                    err instanceof Error
                      ? err.message
                      : mediaCopy.uploadFailed[locale],
                }
              : u,
          ),
        );
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
    await loadImages();
  }

  async function patchImage(
    id: string,
    patch: Record<string, unknown>,
    failureNotice: string,
  ) {
    setBusyId(id);
    setNotice("");
    try {
      const response = await fetch("/api/management/product-images", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      if (!response.ok) {
        setNotice(failureNotice);
        return false;
      }
      await loadImages();
      return true;
    } catch {
      setNotice(failureNotice);
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function moveImage(index: number, direction: -1 | 1) {
    if (images === null) return;
    const target = index + direction;
    if (target < 0 || target >= images.length) return;
    const reordered = [...images];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved);
    setImages(reordered);
    const first = reordered[target];
    const second = reordered[index];
    const okFirst = await patchImage(
      first.id,
      { sort_order: target },
      mediaCopy.imageOperationFailed[locale],
    );
    if (!okFirst) return;
    await patchImage(
      second.id,
      { sort_order: index },
      mediaCopy.imageOperationFailed[locale],
    );
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const response = await fetch(
        `/api/management/product-images?id=${pendingDelete.id}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        setNotice(mediaCopy.imageOperationFailed[locale]);
        return;
      }
      setPendingDelete(null);
      await loadImages();
    } catch {
      setNotice(mediaCopy.imageOperationFailed[locale]);
    } finally {
      setDeleting(false);
    }
  }

  function openAltEdit(image: ProductImage) {
    setAltEdit(image);
    setAltHe(image.alt_he ?? "");
    setAltEn(image.alt_en ?? "");
    setAltError("");
  }

  async function saveAlt() {
    if (!altEdit) return;
    setAltSaving(true);
    setAltError("");
    try {
      const response = await fetch("/api/management/product-images", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: altEdit.id,
          alt_he: altHe || null,
          alt_en: altEn || null,
        }),
      });
      if (!response.ok) {
        setAltError(mediaCopy.imageOperationFailed[locale]);
        return;
      }
      setAltEdit(null);
      await loadImages();
    } catch {
      setAltError(mediaCopy.imageOperationFailed[locale]);
    } finally {
      setAltSaving(false);
    }
  }

  if (images === null && !error) {
    return <ListSkeleton rows={3} />;
  }

  return (
    <div className={styles.sectionStack}>
      {error ? (
        <Notice
          tone="danger"
          onDismiss={() => setError("")}
          dismissLabel={editorCopy.dismiss[locale]}
        >
          {error}
        </Notice>
      ) : null}
      {notice ? (
        <Notice
          tone="danger"
          onDismiss={() => setNotice("")}
          dismissLabel={editorCopy.dismiss[locale]}
        >
          {notice}
        </Notice>
      ) : null}

      <div>
        <input
          ref={fileInputRef}
          id={fileInputId}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          multiple
          className={styles.fileInput}
          onChange={(e) => void handleFilesSelected(e.target.files)}
        />
        <label
          htmlFor={fileInputId}
          className="miro-button miro-button-secondary inline-flex items-center gap-2 cursor-pointer"
        >
          <Upload className="h-4 w-4" aria-hidden="true" />
          {mediaCopy.uploadLabel[locale]}
        </label>
        <p className={styles.statusNote} role="note">
          {mediaCopy.uploadHint[locale]}
        </p>
      </div>

      {uploads.length > 0 ? (
        <ul className={styles.uploadList}>
          {uploads.map((upload) => (
            <li key={upload.key} className={styles.uploadRow}>
              <span
                className={`${styles.uploadName} ${styles.ltrText}`}
                dir="ltr"
              >
                {upload.name}
              </span>
              {upload.error ? (
                <span className={styles.uploadError} role="alert">
                  {mediaCopy.uploadFailed[locale]}: {upload.error}
                </span>
              ) : (
                <>
                  <span
                    className={styles.uploadProgress}
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(upload.progress * 100)}
                    aria-label={`${mediaCopy.uploading[locale]} ${upload.name}`}
                  >
                    <span
                      className={styles.uploadProgressFill}
                      style={{ inlineSize: `${upload.progress * 100}%` }}
                    />
                  </span>
                  <Loader2
                    className="h-4 w-4 animate-spin text-muted-foreground"
                    aria-hidden="true"
                  />
                </>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {images !== null && images.length === 0 ? (
        <EmptyState
          icon={<ImageIcon size={20} />}
          title={mediaCopy.empty[locale]}
          description={mediaCopy.emptyDescription[locale]}
          compact
        />
      ) : null}

      {images !== null && images.length > 0 ? (
        <ul className={styles.galleryGrid} aria-label={mediaCopy.title[locale]}>
          {images.map((image, index) => {
            const isPrimary = index === 0;
            const altText = he
              ? (image.alt_he ?? image.alt_en ?? "")
              : (image.alt_en ?? image.alt_he ?? "");
            return (
              <li
                key={image.id}
                className={`${styles.imageTile} ${isPrimary ? styles.imageTilePrimary : ""}`}
              >
                <div className={styles.imageFrame}>
                  {isPrimary ? (
                    <span className={styles.primaryBadge}>
                      {mediaCopy.primary[locale]}
                    </span>
                  ) : null}
                  <Image
                    src={image.image_url}
                    alt={altText}
                    fill
                    className="object-cover"
                    sizes="(max-width: 640px) 50vw, 176px"
                    unoptimized={image.image_url.endsWith(".svg")}
                  />
                </div>
                <div className={styles.tileBody}>
                  <p className={`${styles.statusNote} truncate`} dir="auto">
                    {altText || "—"}
                  </p>
                  <div className={styles.tileActions}>
                    <button
                      type="button"
                      className={styles.iconButton}
                      onClick={() => void moveImage(index, -1)}
                      disabled={index === 0 || busyId !== null}
                      aria-label={mediaCopy.moveUp[locale]}
                    >
                      <ArrowUp className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={styles.iconButton}
                      onClick={() => void moveImage(index, 1)}
                      disabled={index === images.length - 1 || busyId !== null}
                      aria-label={mediaCopy.moveDown[locale]}
                    >
                      <ArrowDown className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={styles.iconButton}
                      onClick={() =>
                        void patchImage(
                          image.id,
                          { is_primary: true },
                          mediaCopy.imageOperationFailed[locale],
                        )
                      }
                      disabled={isPrimary || busyId !== null}
                      aria-label={mediaCopy.setPrimary[locale]}
                      title={mediaCopy.setPrimary[locale]}
                    >
                      <Star className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={styles.iconButton}
                      onClick={() => openAltEdit(image)}
                      aria-label={mediaCopy.editAlt[locale]}
                      title={mediaCopy.editAlt[locale]}
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className={`${styles.iconButton} ${styles.iconButtonDanger}`}
                      onClick={() => setPendingDelete(image)}
                      aria-label={mediaCopy.deleteImage[locale]}
                      title={mediaCopy.deleteImage[locale]}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      <Dialog
        open={altEdit !== null}
        onClose={() => {
          if (!altSaving) setAltEdit(null);
        }}
        title={mediaCopy.altDialogTitle[locale]}
        size="md"
        closeLabel={editorCopy.close[locale]}
        footer={
          <>
            <button
              type="button"
              className="miro-button miro-button-secondary"
              onClick={() => setAltEdit(null)}
              disabled={altSaving}
            >
              {editorCopy.cancel[locale]}
            </button>
            <button
              type="button"
              className="miro-button miro-button-primary"
              onClick={() => void saveAlt()}
              disabled={altSaving}
              aria-busy={altSaving || undefined}
            >
              {altSaving
                ? editorCopy.saving[locale]
                : mediaCopy.saveAlt[locale]}
            </button>
          </>
        }
      >
        <div className={styles.sectionStack}>
          {altError ? <Notice tone="danger">{altError}</Notice> : null}
          <FormField id="image-alt-he" label={mediaCopy.altHe[locale]}>
            {(control) => (
              <input
                {...control}
                type="text"
                className="miro-input"
                dir="auto"
                value={altHe}
                maxLength={300}
                onChange={(e) => setAltHe(e.target.value)}
                disabled={altSaving}
              />
            )}
          </FormField>
          <FormField id="image-alt-en" label={mediaCopy.altEn[locale]}>
            {(control) => (
              <input
                {...control}
                type="text"
                className="miro-input"
                dir="auto"
                value={altEn}
                maxLength={300}
                onChange={(e) => setAltEn(e.target.value)}
                disabled={altSaving}
              />
            )}
          </FormField>
        </div>
      </Dialog>

      <ConfirmationDialog
        open={pendingDelete !== null}
        onConfirm={() => void confirmDelete()}
        onCancel={() => {
          if (!deleting) setPendingDelete(null);
        }}
        title={mediaCopy.deleteImageTitle[locale]}
        description={mediaCopy.deleteImageDescription[locale]}
        confirmLabel={mediaCopy.deleteImage[locale]}
        cancelLabel={editorCopy.cancel[locale]}
        tone="danger"
        busy={deleting}
        closeLabel={editorCopy.close[locale]}
      />
    </div>
  );
}
