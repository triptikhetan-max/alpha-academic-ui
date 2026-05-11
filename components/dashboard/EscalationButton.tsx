"use client";

/**
 * EscalationButton — small "Escalate to Subject DRI" trigger.
 *
 * Renders an inline button next to the existing Acknowledge / Log action /
 * View profile cluster. Click opens an `EscalationModal` that POSTs an
 * `action: "escalated"` event to `/api/dashboard/feedback`.
 *
 * Lives next to the other triage actions so the Campus DRI never has to
 * leave the queue to escalate.
 */
import { useState } from "react";
import { EscalationModal } from "./EscalationModal";

interface EscalationButtonProps {
  studentId: string;
  studentName: string;
  studentSlug: string;
  campus?: string;
  subject?: string;
  grade?: number;
  flagId?: string;
  variant?: "inline" | "stacked";
}

export function EscalationButton(props: EscalationButtonProps) {
  const [open, setOpen] = useState(false);
  const baseClass =
    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs border border-purple-200 bg-purple-50 text-purple-900 hover:border-purple-300 hover:bg-purple-100 transition";
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={baseClass}
        aria-haspopup="dialog"
      >
        <span aria-hidden="true">↑</span>
        Escalate to Subject DRI
      </button>
      <EscalationModal
        open={open}
        onClose={() => setOpen(false)}
        studentId={props.studentId}
        studentName={props.studentName}
        studentSlug={props.studentSlug}
        campus={props.campus}
        subject={props.subject}
        grade={props.grade}
        flagId={props.flagId}
      />
    </>
  );
}
