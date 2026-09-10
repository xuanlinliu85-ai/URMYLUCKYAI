import { NightResult } from "@/components/NightResult";
export default async function ResultPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <main className="app-shell"><NightResult code={code.toUpperCase()} /></main>;
}
