import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clubExportXlsx, exportFileName, XLSX_MIME, type InsightMatch } from "@/lib/clubInsights";

// Download every loaded game as an Excel workbook (Matches, Players, Player match log, Nights)
export function ExportButton({ matches, clubName, size = "sm" }: { matches: InsightMatch[]; clubName: string; size?: "sm" | "default" }) {
  if (!matches.length) return null;
  const download = () => {
    const blob = new Blob([clubExportXlsx(matches)], { type: XLSX_MIME });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = exportFileName(clubName);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <Button variant="outline" size={size} onClick={download}>
      <Download className="mr-1 h-4 w-4" /> Excel
    </Button>
  );
}
