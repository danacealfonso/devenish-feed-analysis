import * as XLSX from "xlsx";
import type { Grid } from "./types";

export interface RawSheet {
  name: string;
  grid: Grid;
}

/** Read every sheet into an A1-anchored grid so row/column refs match what the user sees in Excel. */
export function readWorkbook(data: ArrayBuffer | Uint8Array): RawSheet[] {
  const wb = XLSX.read(data, { type: "array" });
  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    const ref = ws["!ref"];
    if (!ref) return { name, grid: [] };
    const range = XLSX.utils.decode_range(ref);
    range.s = { r: 0, c: 0 };
    const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: true,
      range: XLSX.utils.encode_range(range),
    });
    return { name, grid };
  });
}
