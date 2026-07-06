import React, { useMemo, useState, useEffect } from "react";
import { Plus, Trash2 } from "lucide-react";

interface TableContainerProps {
  key?: React.Key;
  rows: string[];
  theme: string;
  onUpdateTable?: (newTableLines: string[]) => void;
  isLocked?: boolean;
}

export default function TableContainer({ rows, theme, onUpdateTable, isLocked = false }: TableContainerProps) {
  // Parse rows into headers and cells
  const parsedData = useMemo(() => {
    let headerCells: string[] = [];
    const bodyRows: string[][] = [];

    // Filter out separator lines (e.g. |---|---|)
    const validRows = rows.filter((r) => !r.includes("---") && r.trim().startsWith("|"));

    validRows.forEach((row, rIdx) => {
      const cells = row
        .split("|")
        .slice(1, -1) // remove outer empty splits
        .map((cell) => cell.trim());

      if (rIdx === 0) {
        headerCells = cells;
      } else {
        bodyRows.push(cells);
      }
    });

    // If headers are empty, create default ones
    if (headerCells.length === 0) {
      headerCells = ["Header 1", "Header 2"];
    }

    // Pad or truncate rows to ensure they match headers count exactly
    const normalizedRows = bodyRows.map((row) => {
      const newRow = [...row];
      while (newRow.length < headerCells.length) {
        newRow.push("");
      }
      return newRow.slice(0, headerCells.length);
    });

    // If body rows are empty, add a default row
    if (normalizedRows.length === 0) {
      normalizedRows.push(Array(headerCells.length).fill(""));
    }

    return { headers: headerCells, dataRows: normalizedRows };
  }, [rows]);

  const [headers, setHeaders] = useState<string[]>(parsedData.headers);
  const [dataRows, setDataRows] = useState<string[][]>(parsedData.dataRows);

  // Sync state with prop updates (e.g. if note content changes externally)
  useEffect(() => {
    setHeaders(parsedData.headers);
    setDataRows(parsedData.dataRows);
  }, [parsedData]);

  // Helper to trigger parent update
  const triggerUpdate = (newHeaders: string[], newRows: string[][]) => {
    if (!onUpdateTable) return;

    // Build markdown columns format separator (e.g. |---|---|)
    const separator = "|" + newHeaders.map(() => "---").join("|") + "|";
    
    // Format header line
    const headerLine = "|" + newHeaders.join("|") + "|";

    // Format data rows
    const dataLines = newRows.map((row) => "|" + row.join("|") + "|");

    onUpdateTable([headerLine, separator, ...dataLines]);
  };

  // Clean cell value to prevent markdown table injection (no newlines, no raw pipe symbols)
  const cleanCellValue = (value: string) => {
    return value.replace(/[\r\n]+/g, " ").replace(/\|/g, " ");
  };

  // Handlers for cell changes
  const handleHeaderChange = (index: number, value: string) => {
    const cleaned = cleanCellValue(value);
    const updated = [...headers];
    updated[index] = cleaned;
    setHeaders(updated);
    triggerUpdate(updated, dataRows);
  };

  const handleCellChange = (rIdx: number, cIdx: number, value: string) => {
    const cleaned = cleanCellValue(value);
    const updated = dataRows.map((row, idx) => {
      if (idx !== rIdx) return row;
      const newRow = [...row];
      newRow[cIdx] = cleaned;
      return newRow;
    });
    setDataRows(updated);
    triggerUpdate(headers, updated);
  };

  // Add Row
  const addRow = () => {
    const newRow = Array(headers.length).fill("");
    const updated = [...dataRows, newRow];
    setDataRows(updated);
    triggerUpdate(headers, updated);
  };

  // Delete Row
  const deleteRow = (rIdx: number) => {
    if (dataRows.length <= 1) return; // Keep at least one row
    const updated = dataRows.filter((_, idx) => idx !== rIdx);
    setDataRows(updated);
    triggerUpdate(headers, updated);
  };

  // Add Column
  const addColumn = () => {
    const newHeaders = [...headers, `Column ${headers.length + 1}`];
    const updatedRows = dataRows.map((row) => [...row, ""]);
    setHeaders(newHeaders);
    setDataRows(updatedRows);
    triggerUpdate(newHeaders, updatedRows);
  };

  // Delete Column
  const deleteColumn = (cIdx: number) => {
    if (headers.length <= 1) return; // Keep at least one column
    const newHeaders = headers.filter((_, idx) => idx !== cIdx);
    const updatedRows = dataRows.map((row) => row.filter((_, idx) => idx !== cIdx));
    setHeaders(newHeaders);
    setDataRows(updatedRows);
    triggerUpdate(newHeaders, updatedRows);
  };

  return (
    <div className="w-full my-4 group/table select-text relative">
      {/* Table Editor Toolbar */}
      {!isLocked && onUpdateTable && (
        <div className="flex items-center justify-between mb-1.5 px-1 select-none">
          <span className="text-[10px] font-bold tracking-wider uppercase text-slate-400 dark:text-zinc-500">
            Interactive Table
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={addColumn}
              className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-zinc-850 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-300 border border-slate-200/40 dark:border-zinc-850 cursor-pointer shadow-xs transition-colors"
              title="Add Column"
            >
              <Plus size={10} />
              <span>+ Column</span>
            </button>
            <button
              onClick={addRow}
              className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-zinc-850 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-300 border border-slate-200/40 dark:border-zinc-850 cursor-pointer shadow-xs transition-colors"
              title="Add Row"
            >
              <Plus size={10} />
              <span>+ Row</span>
            </button>
          </div>
        </div>
      )}

      {/* Styled Responsive Table */}
      <div className="w-full overflow-x-auto rounded-lg border border-slate-250/60 dark:border-zinc-800/80 shadow-xs bg-white dark:bg-zinc-950">
        <table className="w-full text-left border-collapse text-[12px] leading-normal table-auto">
          <thead>
            <tr className="bg-slate-50/80 dark:bg-zinc-900/80 border-b border-slate-200 dark:border-zinc-800">
              {/* Row Deletion header spacer */}
              {!isLocked && onUpdateTable && (
                <th className="w-8 px-2 py-1.5 text-center border-r border-slate-200 dark:border-zinc-800 bg-slate-100/40 dark:bg-zinc-900/40"></th>
              )}
              {headers.map((header, idx) => (
                <th
                  key={idx}
                  className="px-3 py-1.5 font-bold text-slate-800 dark:text-zinc-200 border-r border-slate-200 dark:border-zinc-800 last:border-r-0 relative group/cell min-w-[100px]"
                >
                  <div className="flex items-center justify-between gap-1.5 min-w-0">
                    <span
                      contentEditable={!isLocked && !!onUpdateTable}
                      suppressContentEditableWarning
                      onBlur={(e) => handleHeaderChange(idx, e.currentTarget.innerText)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          e.currentTarget.blur();
                        }
                      }}
                      className="outline-none focus:bg-blue-500/10 focus:ring-1 focus:ring-blue-400 rounded px-1 flex-grow truncate block min-h-[1.2em]"
                    >
                      {header}
                    </span>
                    {!isLocked && onUpdateTable && headers.length > 1 && (
                      <button
                        onClick={() => deleteColumn(idx)}
                        className="opacity-0 group-hover/cell:opacity-100 p-0.5 rounded text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 shrink-0 cursor-pointer transition-all"
                        title="Delete Column"
                      >
                        <Trash2 size={10} />
                      </button>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dataRows.map((rowCells, rIdx) => (
              <tr
                key={rIdx}
                className="border-b border-slate-200 dark:border-zinc-850 last:border-b-0 hover:bg-slate-50/20 dark:hover:bg-zinc-900/10 transition-colors"
              >
                {/* Row Deletion action cell */}
                {!isLocked && onUpdateTable && (
                  <td className="w-8 px-2 py-1.5 text-center border-r border-slate-200 dark:border-zinc-850 bg-slate-100/10 dark:bg-zinc-900/10">
                    {dataRows.length > 1 && (
                      <button
                        onClick={() => deleteRow(rIdx)}
                        className="p-0.5 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 cursor-pointer inline-flex items-center justify-center transition-all"
                        title="Delete Row"
                      >
                        <Trash2 size={10} />
                      </button>
                    )}
                  </td>
                )}
                {rowCells.map((cell, cIdx) => (
                  <td
                    key={cIdx}
                    className="px-3 py-1.5 border-r border-slate-200 dark:border-zinc-850 last:border-r-0 relative group/cell"
                  >
                    <div className="flex items-center justify-between gap-1.5 min-w-0">
                      <span
                        contentEditable={!isLocked && !!onUpdateTable}
                        suppressContentEditableWarning
                        onBlur={(e) => handleCellChange(rIdx, cIdx, e.currentTarget.innerText)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            e.currentTarget.blur();
                          }
                        }}
                        className="outline-none focus:bg-blue-500/10 focus:ring-1 focus:ring-blue-400 rounded px-1 flex-grow block min-h-[1.2em]"
                      >
                        {cell}
                      </span>
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
