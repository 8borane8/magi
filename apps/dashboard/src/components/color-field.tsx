export default function ColorField(
	{ value, onInput }: { value: string; onInput: (value: string) => void },
) {
	return (
		<label class="field">
			<span>Couleur</span>
			<span class="color-field">
				<input
					type="color"
					value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#3e4a9a"}
					onInput={(event) => onInput((event.target as HTMLInputElement).value)}
				/>
				<input
					type="text"
					value={value}
					spellcheck={false}
					onInput={(event) => onInput((event.target as HTMLInputElement).value)}
				/>
			</span>
		</label>
	);
}
