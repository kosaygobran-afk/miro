type OrderedRow = { id: string; sort_order: number };

/** Move one adjacent row, assigning unique ranks even when legacy ranks tie. */
export function buildOrderUpdates(
  rows: OrderedRow[],
  id: string,
  delta: number,
) {
  const index = rows.findIndex((row) => row.id === id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= rows.length || Math.abs(delta) !== 1)
    return [];
  const ordered = [...rows];
  [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
  return ordered.flatMap((row, position) =>
    row.sort_order === (position + 1) * 10
      ? []
      : [{ id: row.id, sort_order: (position + 1) * 10 }],
  );
}
