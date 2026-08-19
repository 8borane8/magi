import { useSignal } from "@preact/signals";
import { Slick } from "@webtools/slick-client";
import { Mic, PanelLeft, Search, SlidersHorizontal } from "lucide-preact";
import { useEffect, useRef } from "preact/hooks";

import HomeFilters, { EMPTY_HOME_FILTERS, type HomeFilters as Filters } from "../../components/home-filters.tsx";
import HomeSubjectsNav from "../../components/home-subjects-nav.tsx";
import { createClient, nodeUrl, type ProcessStreamEvent, watchLectureProcess } from "../../client.ts";
import { recordSession } from "../../utils/record-session.ts";
import { formatDuration, lectureTitle, STATUS_LABEL } from "../../utils/lecture-format.ts";
import { readHomeQueryFromBrowser, writeHomeQuery } from "../../utils/home-query.ts";
import { sleep } from "../../utils/ndjson.ts";
import { type ProcessStage, SessionStatus } from "@magi/shared/types/session";

type SubjectItem = { id: string; name: string; color: string };
type TagItem = { id: string; name: string; color: string };
type LectureRow = {
	id: string;
	title: string | null;
	createdAt: string | Date;
	updatedAt?: string | Date;
	subjectId: string | null;
	status: SessionStatus;
	processStage?: ProcessStage | null;
	audioMs: number;
	tags?: TagItem[];
};
type ProcessView = {
	stage: string;
	stageAt: number;
};

const STAGE_LABEL: Record<string, string> = {
	transcribe: "Transcription",
	classify: "Classement",
	fiche: "Rédaction de la fiche",
};

function liveRow(lecture: LectureRow): LectureRow {
	if (recordSession.status === "idle" || recordSession.lectureId !== lecture.id) {
		return lecture;
	}

	return {
		...lecture,
		audioMs: recordSession.elapsedSec * 1_000,
		status: recordSession.status === "paused" ? SessionStatus.PAUSED : SessionStatus.RECORDING,
	};
}

function lectureRowInner(lecture: LectureRow) {
	const tags = lecture.tags || [];
	return (
		<>
			<strong>{lectureTitle(lecture)}</strong>
			<span class="lecture-tags">
				{tags.map((tag) => (
					<span class="pill" key={tag.id}>
						<span class="swatch" style={{ background: tag.color }}></span>
						<span>{tag.name}</span>
					</span>
				))}
			</span>
			<time>{formatDuration(lecture.audioMs)}</time>
			<span class="pill" data-status={lecture.status}>
				{STATUS_LABEL[lecture.status as SessionStatus] || lecture.status}
			</span>
		</>
	);
}

function activeFilterCount(filters: Filters): number {
	let count = 0;
	if (filters.tagId) count++;
	if (filters.status) count++;
	if (filters.from || filters.to) count++;
	return count;
}

function matchesSubjectFilter(lecture: LectureRow, filter: string): boolean {
	if (filter === "all") return true;
	if (filter === "none") return !lecture.subjectId;
	return lecture.subjectId === filter;
}

function countBySubject(lectures: LectureRow[]): Map<string, number> {
	const counts = new Map<string, number>();
	for (const lecture of lectures) {
		if (!lecture.subjectId) continue;
		counts.set(lecture.subjectId, (counts.get(lecture.subjectId) || 0) + 1);
	}
	return counts;
}

function groupLectures(visible: LectureRow[], subjects: SubjectItem[]) {
	const grouped = new Map<string, LectureRow[]>();
	for (const lecture of visible) {
		const key = lecture.subjectId || "";
		const list = grouped.get(key);
		if (list) list.push(lecture);
		else grouped.set(key, [lecture]);
	}

	const groups: { key: string; subject: SubjectItem | null; rows: LectureRow[] }[] = [];
	for (const subject of subjects) {
		const rows = grouped.get(subject.id);
		if (rows?.length) groups.push({ key: subject.id, subject, rows });
	}

	const unspecialized = grouped.get("");
	if (unspecialized?.length) groups.push({ key: "", subject: null, rows: unspecialized });
	return groups;
}

function applyProcessEvent(
	current: Record<string, ProcessView>,
	id: string,
	event: ProcessStreamEvent,
): Record<string, ProcessView> | null {
	const prev = current[id] || { stage: "transcribe", stageAt: 0 };
	if (event.type === "init") {
		return { ...current, [id]: { stage: event.stage, stageAt: prev.stageAt } };
	}
	if (event.type === "stage") {
		return { ...current, [id]: { stage: event.stage, stageAt: Date.now() } };
	}
	return null;
}

function applyHomeQuery(
	q: { value: string },
	appliedQ: { value: string },
	subjectFilter: { value: string },
	filters: { value: Filters },
) {
	const state = readHomeQueryFromBrowser();
	q.value = state.q;
	appliedQ.value = state.q;
	subjectFilter.value = state.subject;
	filters.value = { ...state.filters };
}

export default function Home({
	subjects: initialSubjects,
	tags: initialTags,
	lectures: initialLectures,
	error: initialError,
}: {
	subjects?: SubjectItem[];
	tags?: TagItem[];
	lectures?: LectureRow[];
	error?: string | null;
}) {
	const q = useSignal("");
	const appliedQ = useSignal("");
	const subjectFilter = useSignal("all");
	const filters = useSignal<Filters>({ ...EMPTY_HOME_FILTERS });
	const draftFilters = useSignal<Filters>({ ...EMPTY_HOME_FILTERS });
	const filtersOpen = useSignal(false);
	const subjectsOpen = useSignal(false);

	const subjects = useSignal<SubjectItem[]>(Array.isArray(initialSubjects) ? initialSubjects : []);
	const tags = useSignal<TagItem[]>(Array.isArray(initialTags) ? initialTags : []);
	const lectures = useSignal<LectureRow[]>(Array.isArray(initialLectures) ? initialLectures : []);
	const error = useSignal<string | null>(initialError || null);
	const filtersRef = useRef<HTMLButtonElement>(null);
	const recTick = useSignal(0);
	const processTick = useSignal(0);
	const processById = useSignal<Record<string, ProcessView>>({});
	const watching = useRef(new Map<string, AbortController>());
	void recTick.value;
	void processTick.value;

	function syncQuery() {
		writeHomeQuery({ q: appliedQ.value, subject: subjectFilter.value, filters: filters.value });
	}

	async function load() {
		if (!nodeUrl()) return;
		error.value = null;
		try {
			const client = createClient();
			const [subjectsRes, tagsRes, lecturesRes] = await Promise.all([
				client.get("/subjects"),
				client.get("/tags"),
				client.get("/lectures", {
					query: {
						q: appliedQ.value || undefined,
						status: filters.value.status || undefined,
						tagId: filters.value.tagId || undefined,
						from: filters.value.from || undefined,
						to: filters.value.to || undefined,
						limit: 200,
					},
				}),
			]);
			if (!subjectsRes.success || !tagsRes.success || !lecturesRes.success) {
				throw new Error("load");
			}
			subjects.value = subjectsRes.data;
			tags.value = tagsRes.data;
			lectures.value = lecturesRes.data.map((row) => {
				const live = processById.value[row.id];
				if (!live || row.status !== SessionStatus.PROCESSING) return row;
				return { ...row, processStage: live.stage as ProcessStage };
			});
		} catch {
			error.value = "Impossible de charger le catalogue.";
		}
	}

	const treatingIds = lectures.value
		.filter((lecture) => lecture.status === SessionStatus.PROCESSING)
		.map((lecture) => lecture.id)
		.join(",");

	useEffect(() => {
		if (!treatingIds) return;
		const timer = setInterval(() => processTick.value++, 1000);
		return () => clearInterval(timer);
	}, [treatingIds]);

	useEffect(() => {
		const ids = treatingIds ? treatingIds.split(",") : [];

		for (const [id, ac] of watching.current) {
			if (ids.includes(id)) continue;
			ac.abort();
			watching.current.delete(id);
		}

		for (const id of ids) {
			if (watching.current.has(id)) continue;
			const ac = new AbortController();
			watching.current.set(id, ac);
			void (async () => {
				while (!ac.signal.aborted) {
					await watchLectureProcess(id, (event) => {
						if (event.type === "init") {
							lectures.value = lectures.value.map((row) =>
								row.id === id ? { ...row, processStage: event.stage as ProcessStage } : row
							);
						}
						if (event.type === "stage") {
							lectures.value = lectures.value.map((row) =>
								row.id === id && row.processStage !== event.stage
									? {
										...row,
										processStage: event.stage as ProcessStage,
										updatedAt: new Date().toISOString(),
									}
									: row
							);
						}
						const next = applyProcessEvent(processById.value, id, event);
						if (next) processById.value = next;
					}, ac.signal);
					if (ac.signal.aborted) return;
					await load();
					const row = lectures.value.find((item) => item.id === id);
					if (row?.status !== SessionStatus.PROCESSING) {
						const { [id]: _dropped, ...rest } = processById.value;
						processById.value = rest;
						return;
					}
					await sleep(500, ac.signal);
				}
			})();
		}
	}, [treatingIds]);

	useEffect(() => {
		return () => {
			for (const ac of watching.current.values()) ac.abort();
			watching.current.clear();
		};
	}, []);

	useEffect(() => {
		let wasBusy = recordSession.status !== "idle";

		const unsubscribe = recordSession.subscribe(() => {
			recTick.value++;
			const busy = recordSession.status !== "idle";
			if (wasBusy && !busy && globalThis.location.pathname === "/") void load();
			wasBusy = busy;
		});

		return unsubscribe;
	}, []);

	useEffect(() => {
		applyHomeQuery(q, appliedQ, subjectFilter, filters);
		syncQuery();

		let active = true;
		const onNavigate = () => {
			if (!active || globalThis.location.pathname !== "/") return;
			applyHomeQuery(q, appliedQ, subjectFilter, filters);
			syncQuery();
			void load();
		};

		void load();
		globalThis.addEventListener("popstate", onNavigate);
		Slick.addOnloadListener(onNavigate);
		return () => {
			active = false;
			globalThis.removeEventListener("popstate", onNavigate);
		};
	}, []);

	useEffect(() => {
		function onPointerDown(event: MouseEvent) {
			if (!filtersOpen.value) return;
			const target = event.target as Node;
			if (filtersRef.current?.contains(target)) return;
			if (document.getElementById("home-filters")?.contains(target)) return;
			applyFilters();
		}
		document.addEventListener("mousedown", onPointerDown);
		return () => document.removeEventListener("mousedown", onPointerDown);
	}, []);

	useEffect(() => {
		function onKeyDown(event: KeyboardEvent) {
			if (event.key !== "Escape") return;
			subjectsOpen.value = false;
			if (filtersOpen.value) applyFilters();
		}
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, []);

	useEffect(() => {
		const mq = matchMedia("(max-width: 640px)");
		function onChange() {
			if (!mq.matches) subjectsOpen.value = false;
		}
		mq.addEventListener("change", onChange);
		return () => mq.removeEventListener("change", onChange);
	}, []);

	const visible = lectures.value.filter((lecture) => matchesSubjectFilter(lecture, subjectFilter.value));
	const groups = groupLectures(visible, subjects.value);
	const noneCount = lectures.value.filter((lecture) => !lecture.subjectId).length;
	const counts = countBySubject(lectures.value);
	const busy = recordSession.status !== "idle";
	const locked = recordSession.status === "recording" || recordSession.status === "stopping";
	const filterCount = activeFilterCount(filters.value);

	function setSubjectFilter(value: string) {
		subjectFilter.value = value;
		subjectsOpen.value = false;
		syncQuery();
		void load();
	}

	function toggleFilters() {
		if (filtersOpen.value) {
			applyFilters();
			return;
		}
		draftFilters.value = { ...filters.value };
		filtersOpen.value = true;
	}

	function applyFilters() {
		if (!filtersOpen.value) return;
		filtersOpen.value = false;
		filters.value = { ...draftFilters.value };
		syncQuery();
		void load();
	}

	function resetFilters() {
		draftFilters.value = { ...EMPTY_HOME_FILTERS };
		filters.value = { ...EMPTY_HOME_FILTERS };
		filtersOpen.value = false;
		syncQuery();
		void load();
	}

	async function retryLecture(lectureId: string) {
		error.value = null;
		try {
			const result = await createClient().post("/lectures/:lectureId/retry", {
				params: { lectureId },
			});
			if (!result.success) throw new Error("retry");
			void load();
		} catch {
			error.value = "Impossible de relancer le traitement.";
		}
	}

	function renderRow(row: LectureRow) {
		const inner = lectureRowInner(row);
		const selected = recordSession.lectureId === row.id;

		if (row.status === SessionStatus.COMPLETED) {
			return <a class="lecture-row" href={`/l/${row.id}`}>{inner}</a>;
		}

		if (row.status === SessionStatus.PAUSED) {
			return (
				<button
					type="button"
					class="lecture-row"
					aria-current={selected ? "true" : undefined}
					disabled={locked && !selected}
					aria-label={selected
						? `Désélectionner : ${lectureTitle(row)}`
						: `Reprendre la main : ${lectureTitle(row)}`}
					onClick={() => selected ? recordSession.detach() : void recordSession.attach(row.id)}
				>
					{inner}
				</button>
			);
		}

		if (row.status === SessionStatus.FAILED) {
			return (
				<button
					type="button"
					class="lecture-row"
					aria-current={selected ? "true" : undefined}
					disabled={busy}
					aria-label={`Relancer le traitement : ${lectureTitle(row)}`}
					onClick={() => void retryLecture(row.id)}
				>
					{inner}
				</button>
			);
		}

		if (row.status === SessionStatus.PROCESSING) {
			const progress = processById.value[row.id];
			const stage = progress?.stage || row.processStage || "";
			const startedAt = progress?.stageAt || new Date(row.updatedAt || row.createdAt).getTime();
			return (
				<div class="lecture-row" aria-current={selected ? "true" : undefined}>
					{inner}
					<div class="lecture-stream">
						<p>
							{STAGE_LABEL[stage] || "Traitement"}
							{" · "}
							{formatDuration(Math.max(0, Date.now() - startedAt))}
						</p>
					</div>
				</div>
			);
		}

		return <div class="lecture-row" aria-current={selected ? "true" : undefined}>{inner}</div>;
	}

	return (
		<section id="home" data-filters-open={filtersOpen.value ? "true" : undefined}>
			<form
				onSubmit={(event) => {
					event.preventDefault();
					appliedQ.value = q.value.trim();
					syncQuery();
					void load();
				}}
			>
				<div>
					<button
						type="button"
						class="btn btn-icon"
						aria-label="Matières"
						aria-expanded={subjectsOpen.value}
						aria-controls="home-subjects"
						onClick={() => subjectsOpen.value = !subjectsOpen.value}
					>
						<PanelLeft size={16} />
					</button>
					<label class="field field-search">
						<input
							type="search"
							aria-label="Recherche"
							placeholder="Titre ou notes"
							value={q}
							onInput={(event) => q.value = (event.target as HTMLInputElement).value}
						/>
					</label>
					<button
						type="button"
						class="btn btn-icon"
						ref={filtersRef}
						aria-label={filterCount
							? `Filtres, ${filterCount} actif${filterCount > 1 ? "s" : ""}`
							: "Filtres"}
						aria-expanded={filtersOpen.value}
						aria-controls="home-filters"
						onClick={toggleFilters}
					>
						<SlidersHorizontal size={16} />
						{filterCount > 0 && <span>{filterCount}</span>}
					</button>
					<button type="submit" class="btn btn-icon" aria-label="Rechercher">
						<Search size={16} />
					</button>
					<button
						type="button"
						class="btn btn-primary"
						aria-label="Nouveau cours"
						disabled={busy}
						onClick={async () => {
							await recordSession.start();
							void load();
						}}
					>
						<Mic size={20} aria-hidden="true" />
						<span>Nouveau cours</span>
					</button>
				</div>
				{filtersOpen.value && (
					<HomeFilters
						tags={tags.value}
						draft={draftFilters}
						onReset={resetFilters}
						onApply={applyFilters}
					/>
				)}
			</form>

			{(error.value || (!busy && recordSession.error)) && (
				<p class="error">{error.value || recordSession.error}</p>
			)}

			{subjectsOpen.value && (
				<button
					type="button"
					aria-label="Fermer le menu matières"
					onClick={() => subjectsOpen.value = false}
				/>
			)}
			<aside id="home-subjects" data-open={subjectsOpen.value ? "true" : undefined}>
				<HomeSubjectsNav
					subjects={subjects.value}
					subjectFilter={subjectFilter.value}
					lecturesCount={lectures.value.length}
					noneCount={noneCount}
					counts={counts}
					onSelect={setSubjectFilter}
				/>
			</aside>

			<article>
				{groups.length === 0 && <p>Aucun cours pour ces critères.</p>}
				{groups.map((group) => (
					<section class="lecture-group" key={group.key}>
						<h2>
							{group.subject
								? (
									<>
										<span class="swatch" style={{ background: group.subject.color }}></span>
										{group.subject.name}
									</>
								)
								: "Non classé"}
						</h2>
						<ol>
							{group.rows.map((lecture) => <li key={lecture.id}>{renderRow(liveRow(lecture))}</li>)}
						</ol>
					</section>
				))}
			</article>
		</section>
	);
}
