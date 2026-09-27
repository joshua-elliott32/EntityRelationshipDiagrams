"use client";

import { openCodeExport } from "@/hooks/useCodeExport";
import { useDiagramStore } from "@/store/diagram";
import { exportJson, exportPng, exportSvg, exportXlsx } from "../actions";
import { DownloadIcon } from "../icons";
import { Menu } from "../ui/Menu";

export function ExportMenu() {
  const empty = useDiagramStore((s) => s.diagram.tables.length === 0);
  return (
    <Menu
      label="Export"
      icon={<DownloadIcon />}
      collapseLabel
      title="Download or copy this diagram"
      triggerTestId="export-menu"
      items={[
        {
          id: "png",
          label: "Image (.png)",
          hint: "For chats, docs and slides",
          softDisabled: empty,
          onSelect: () => void exportPng(),
        },
        {
          id: "svg",
          label: "Vector image (.svg)",
          hint: "Scales without blurring",
          softDisabled: empty,
          onSelect: () => void exportSvg(),
        },
        {
          id: "xlsx",
          label: "Excel workbook (.xlsx)",
          hint: "Tables, columns, relationships and issues",
          softDisabled: empty,
          onSelect: () => void exportXlsx(),
        },
        {
          id: "sql",
          label: "SQL…",
          hint: "CREATE TABLE script for your database",
          separatorBefore: true,
          onSelect: () => openCodeExport("sql"),
        },
        {
          id: "mermaid",
          label: "Mermaid…",
          hint: "For Markdown, GitHub and Notion",
          onSelect: () => openCodeExport("mermaid"),
        },
        {
          id: "dbml",
          label: "DBML…",
          hint: "For dbdiagram.io and dbdocs",
          onSelect: () => openCodeExport("dbml"),
        },
        {
          id: "json",
          label: "Diagram file (.json)",
          hint: "Re-open later with Import",
          separatorBefore: true,
          onSelect: exportJson,
        },
      ]}
    />
  );
}
