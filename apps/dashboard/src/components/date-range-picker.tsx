import { useSignal } from "@preact/signals";
import { ChevronLeft, ChevronRight } from "lucide-preact";
import { useEffect } from "preact/hooks";

const WEEKDAYS = ["Lu", "Ma", "Me", "Je", "Ve", "Sa", "Di"];
const MONTHS = [
	"Janvier",
	"Février",
	"Mars",
	"Avril",
	"Mai",
	"Juin",
	"Juillet",
	"Août",
	"Septembre",
	"Octobre",
	"Novembre",
	"Décembre",
];

type CalendarCell = {
	date: Date;
	key: string;
	adjacent: boolean;
};

function toIso(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

function parseIso(value: string): Date | null {
	if (!value) return null;
	const date = new Date(`${value}T12:00:00`);
	return Number.isNaN(date.getTime()) ? null : date;
}

function sameDay(a: Date, b: Date): boolean {
	return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function dayIndex(date: Date): number {
	return date.getFullYear() * 10000 + date.getMonth() * 100 + date.getDate();
}

function monthKey(date: Date): string {
	return `${date.getFullYear()}-${date.getMonth()}`;
}

function buildCells(year: number, month: number): CalendarCell[] {
	const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
	const totalDays = new Date(year, month + 1, 0).getDate();
	const prevMonthLast = new Date(year, month, 0).getDate();
	const cells: CalendarCell[] = [];

	for (let i = 0; i < firstWeekday; i++) {
		const day = prevMonthLast - firstWeekday + i + 1;
		const date = new Date(year, month - 1, day);
		cells.push({ date, key: toIso(date), adjacent: true });
	}

	for (let day = 1; day <= totalDays; day++) {
		const date = new Date(year, month, day);
		cells.push({ date, key: toIso(date), adjacent: false });
	}

	let nextDay = 1;
	while (cells.length % 7 !== 0) {
		const date = new Date(year, month + 1, nextDay++);
		cells.push({ date, key: toIso(date), adjacent: true });
	}

	return cells;
}

function commitRange(
	anchor: Date | null,
	hover: Date | null,
	onChange: (from: string, to: string) => void,
): void {
	if (!anchor || !hover) return;
	const a = dayIndex(anchor) <= dayIndex(hover) ? anchor : hover;
	const b = dayIndex(anchor) <= dayIndex(hover) ? hover : anchor;
	onChange(toIso(a), toIso(b));
}

export default function DateRangePicker(
	{ from, to, onChange }: { from: string; to: string; onChange: (from: string, to: string) => void },
) {
	const cursor = useSignal(parseIso(from) || new Date());
	const anchor = useSignal<Date | null>(parseIso(from));
	const hover = useSignal<Date | null>(parseIso(to) || parseIso(from));
	const selecting = useSignal(false);

	useEffect(() => {
		const stop = () => {
			if (!selecting.value) return;
			selecting.value = false;
			commitRange(anchor.value, hover.value, onChange);
		};
		globalThis.addEventListener("mouseup", stop);
		return () => globalThis.removeEventListener("mouseup", stop);
	}, []);

	const year = cursor.value.getFullYear();
	const month = cursor.value.getMonth();
	const cells = buildCells(year, month);

	const rangeStart = anchor.value && hover.value
		? (dayIndex(anchor.value) <= dayIndex(hover.value) ? anchor.value : hover.value)
		: parseIso(from);
	const rangeEnd = anchor.value && hover.value
		? (dayIndex(anchor.value) <= dayIndex(hover.value) ? hover.value : anchor.value)
		: parseIso(to);

	function inRange(date: Date): boolean {
		if (!rangeStart || !rangeEnd) return false;
		const idx = dayIndex(date);
		return idx >= dayIndex(rangeStart) && idx <= dayIndex(rangeEnd);
	}

	function focusMonth(date: Date) {
		if (monthKey(date) !== monthKey(cursor.value)) {
			cursor.value = new Date(date.getFullYear(), date.getMonth(), 1);
		}
	}

	function onDayEnter(date: Date) {
		if (!selecting.value) return;
		hover.value = date;
		focusMonth(date);
		commitRange(anchor.value, date, onChange);
	}

	function onDayDown(date: Date) {
		anchor.value = date;
		hover.value = date;
		selecting.value = true;
		focusMonth(date);
		onChange(toIso(date), toIso(date));
	}

	function shiftMonth(delta: number) {
		cursor.value = new Date(year, month + delta, 1);
	}

	function onNavEnter(delta: number) {
		if (!selecting.value) return;
		shiftMonth(delta);
	}

	function onNavDown(event: Event, delta: number) {
		event.preventDefault();
		shiftMonth(delta);
	}

	function applyManual(nextFrom: string, nextTo: string) {
		const start = parseIso(nextFrom);
		const end = parseIso(nextTo);

		if (start && end && dayIndex(start) > dayIndex(end)) {
			onChange(nextTo, nextFrom);
			anchor.value = end;
			hover.value = start;
			cursor.value = new Date(end.getFullYear(), end.getMonth(), 1);
			return;
		}

		onChange(nextFrom, nextTo);
		anchor.value = start;
		hover.value = end || start;
		if (start) cursor.value = new Date(start.getFullYear(), start.getMonth(), 1);
		else if (end) cursor.value = new Date(end.getFullYear(), end.getMonth(), 1);
	}

	return (
		<div class="date-range" data-selecting={selecting.value ? "true" : undefined}>
			<div class="date-range-head">
				<button
					type="button"
					class="btn btn-icon"
					aria-label="Mois précédent"
					onMouseDown={(event) => onNavDown(event, -1)}
					onMouseEnter={() => onNavEnter(-1)}
				>
					<ChevronLeft size={16} />
				</button>
				<p>{MONTHS[month]} {year}</p>
				<button
					type="button"
					class="btn btn-icon"
					aria-label="Mois suivant"
					onMouseDown={(event) => onNavDown(event, 1)}
					onMouseEnter={() => onNavEnter(1)}
				>
					<ChevronRight size={16} />
				</button>
			</div>
			<ol class="date-range-weekdays">
				{WEEKDAYS.map((label) => <li key={label}>{label}</li>)}
			</ol>
			<ol class="date-range-grid">
				{cells.map(({ date, key, adjacent }) => (
					<li key={key}>
						<button
							type="button"
							data-adjacent={adjacent ? "true" : undefined}
							data-in-range={inRange(date) ? "true" : undefined}
							data-end={rangeEnd && sameDay(date, rangeEnd) ? "true" : undefined}
							data-start={rangeStart && sameDay(date, rangeStart) ? "true" : undefined}
							onMouseDown={(event) => {
								event.preventDefault();
								onDayDown(date);
							}}
							onMouseEnter={() => onDayEnter(date)}
						>
							{date.getDate()}
						</button>
					</li>
				))}
			</ol>
			<div class="date-range-summary">
				<label class="date-range-field">
					<span>Du</span>
					<input
						type="date"
						value={from}
						onChange={(event) => applyManual((event.target as HTMLInputElement).value, to)}
					/>
				</label>
				<span class="date-range-sep">→</span>
				<label class="date-range-field">
					<span>Au</span>
					<input
						type="date"
						value={to}
						onChange={(event) => applyManual(from, (event.target as HTMLInputElement).value)}
					/>
				</label>
			</div>
		</div>
	);
}
