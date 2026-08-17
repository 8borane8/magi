import { useSignal } from "@preact/signals";
import { Cookies, Slick } from "@webtools/slick-client";
import { Mic, PanelLeft, Search, SlidersHorizontal } from "lucide-preact";
import { useEffect, useRef } from "preact/hooks";

import HomeFilters, { EMPTY_HOME_FILTERS, type HomeFilters as Filters } from "../../components/home-filters.tsx";
import HomeSubjectsNav from "../../components/home-subjects-nav.tsx";
import { createClient } from "../../client.ts";
import { recordSession } from "../../utils/record-session.ts";
import { formatDuration, lectureTitle, STATUS_LABEL } from "../../utils/lecture-format.ts";
import { readHomeQueryFromBrowser, writeHomeQuery } from "../../utils/home-query.ts";
import { SessionStatus } from "@magi/shared/types/session";

type Client = ReturnType<typeof createClient>;

function loadSubjects(client: Client) {
	return client.get("/subjects");
}

function loadTags(client: Client) {
	return client.get("/tags");
}

function loadLectures(client: Client) {
	return client.get("/lectures", { query: { limit: 1, page: 1 } });
}

type SubjectItem = Awaited<ReturnType<typeof loadSubjects>>["items"][number];
type TagItem = Awaited<ReturnType<typeof loadTags>>["items"][number];
type LectureRow = Awaited<ReturnType<typeof loadLectures>>["data"]["rows"][number] & {
	tags?: Pick<TagItem, "id" | "name" | "color">[];
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
	const tags = lecture.tags ?? [];
	return (
		<>
			<strong>{lectureTitle(lecture)}</strong>
			<span class="lecture-tags">
				{tags.map((tag) => (
					<span class="pill" key={tag.id}>
						<span class="swatch" style={{ background: tag.color }}></span>
						{tag.name}
					</span>
				))}
			</span>
			<time>{formatDuration(lecture.audioMs)}</time>
			<span class="pill" data-status={lecture.status}>
				{STATUS_LABEL[lecture.status as SessionStatus] ?? lecture.status}
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
		counts.set(lecture.subjectId, (counts.get(lecture.subjectId) ?? 0) + 1);
	}
	return counts;
}

function groupLectures(visible: LectureRow[], subjects: SubjectItem[]) {
	const grouped = new Map<string, LectureRow[]>();
	for (const lecture of visible) {
		const key = lecture.subjectId ?? "";
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

export default function Home() {
	const q = useSignal("");
	const appliedQ = useSignal("");
	const subjectFilter = useSignal("all");
	const filters = useSignal<Filters>({ ...EMPTY_HOME_FILTERS });
	const draftFilters = useSignal<Filters>({ ...EMPTY_HOME_FILTERS });
	const filtersOpen = useSignal(false);
	const subjectsOpen = useSignal(false);

	const subjects = useSignal<SubjectItem[]>([]);
	const tags = useSignal<TagItem[]>([]);
	const lectures = useSignal<LectureRow[]>([]);
	const error = useSignal<string | null>(null);
	const filtersRef = useRef<HTMLButtonElement>(null);
	const recTick = useSignal(0);
	void recTick.value;

	function syncQuery() {
		writeHomeQuery({ q: appliedQ.value, subject: subjectFilter.value, filters: filters.value });
	}

	async function load() {
		if (!Cookies.get("nodeUrl")) return;
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
						page: 1,
					},
				}),
			]);
			subjects.value = subjectsRes.items;
			tags.value = tagsRes.items;
			lectures.value = lecturesRes.data.rows;
		} catch {
			error.value = "Impossible de charger le catalogue.";
		}
	}

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

		const onNavigate = () => {
			if (globalThis.location.pathname !== "/") return;
			applyHomeQuery(q, appliedQ, subjectFilter, filters);
			syncQuery();
			void load();
		};

		void load();
		globalThis.addEventListener("popstate", onNavigate);
		Slick.addOnloadListener(onNavigate);
		return () => globalThis.removeEventListener("popstate", onNavigate);
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
