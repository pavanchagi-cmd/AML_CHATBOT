"use client";

import { useState } from "react";
import { DocumentsTable, type DocumentRow } from "@/components/DocumentsTable";
import { PipelineProgress, type PipelineState } from "@/components/PipelineProgress";
import { UploadZone, checkFile } from "@/components/UploadZone";
import { Lead, Page, PageInner, TopBar } from "@/components/ui";

export function LibraryView() {
  // Documents come from GET /api/documents once the database is wired up (build step 4).
  const [docs] = useState<DocumentRow[]>([]);
  const [pipeline, setPipeline] = useState<PipelineState | null>(null);

  function handleFile(file: File) {
    const problem = checkFile(file);
    if (problem) {
      setPipeline({ name: file.name, stage: 0, message: problem, error: true });
      return;
    }
    setPipeline({
      name: file.name,
      stage: 0,
      message: "Uploading isn't connected yet. It arrives in build step 4.",
      error: true,
    });
  }

  return (
    <Page>
      <TopBar title="Library" />
      <PageInner>
        <Lead>
          Upload FATF reports, Indian AML rules or internal SOPs. Each file is split into overlapping chunks and
          indexed, so analysts can ask questions about it straight away.
        </Lead>
        <UploadZone onFile={handleFile} />
        {pipeline && <PipelineProgress state={pipeline} />}
        <DocumentsTable docs={docs} isAdmin={false} onDelete={() => {}} onReindex={() => {}} />
      </PageInner>
    </Page>
  );
}
