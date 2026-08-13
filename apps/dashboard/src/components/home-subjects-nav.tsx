type SubjectItem = {
	id: string;
	name: string;
	color: string;
};

type HomeSubjectsNavProps = {
	subjects: SubjectItem[];
	subjectFilter: string;
	lecturesCount: number;
	noneCount: number;
	counts: Map<string, number>;
	onSelect: (value: string) => void;
};

export default function HomeSubjectsNav({
	subjects,
	subjectFilter,
	lecturesCount,
	noneCount,
	counts,
	onSelect,
}: HomeSubjectsNavProps) {
	return (
		<>
			<h2>Matières</h2>
			<ol>
				<li>
					<button
						type="button"
						aria-current={subjectFilter === "all" ? "true" : undefined}
						onClick={() => onSelect("all")}
					>
						<span>Toutes</span>
						<span>{lecturesCount}</span>
					</button>
				</li>
				<li>
					<button
						type="button"
						aria-current={subjectFilter === "none" ? "true" : undefined}
						onClick={() => onSelect("none")}
					>
						<span>Non classé</span>
						<span>{noneCount}</span>
					</button>
				</li>
				{subjects.map((subject) => (
					<li key={subject.id}>
						<button
							type="button"
							aria-current={subjectFilter === subject.id ? "true" : undefined}
							onClick={() => onSelect(subject.id)}
						>
							<span>
								<span class="swatch" style={{ background: subject.color }}></span>
								{subject.name}
							</span>
							<span>{counts.get(subject.id) ?? 0}</span>
						</button>
					</li>
				))}
			</ol>
		</>
	);
}
