import MarkdownContent from "./markdown-content.tsx";

export type ChatAttachmentData = {
	kind: "image";
	path: string;
};

export type ChatMessageData = {
	id: string;
	role: "user" | "assistant";
	content: string;
	attachments?: ChatAttachmentData[] | null;
};

export default function ChatMessage({
	message,
	srcPrefix,
}: {
	message: ChatMessageData;
	srcPrefix: string;
}) {
	const images = (message.attachments || []).filter((item) => item.kind === "image");

	return (
		<li data-role={message.role}>
			{images.length > 0 && (
				<ul>
					{images.map((item) => (
						<li key={item.path}>
							<img
								src={`${srcPrefix}/${encodeURIComponent(item.path)}`}
								alt="Image jointe"
							/>
						</li>
					))}
				</ul>
			)}
			{message.content &&
				(message.role === "assistant"
					? <MarkdownContent source={message.content} />
					: <p>{message.content}</p>)}
		</li>
	);
}
