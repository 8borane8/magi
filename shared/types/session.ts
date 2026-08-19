export enum SessionStatus {
	RECORDING = "recording",
	PAUSED = "paused",

	PROCESSING = "processing",
	COMPLETED = "completed",
	FAILED = "failed",
}

export const PROCESS_STAGES = ["transcribe", "classify", "fiche"] as const;
export type ProcessStage = typeof PROCESS_STAGES[number];
