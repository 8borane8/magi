import MarkdownContent from "./markdown-content.tsx";

export type ChatAttachmentData = {
	kind: "image" | "pdf" | "text";
	path: string;
	name?: string;
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
	const attachments = message.attachments || [];

	return (
		<li data-role={message.role}>
			{attachments.length > 0 && (
				<ul>
					{attachments.map((item) => (
						<li key={item.path} data-kind={item.kind}>
							{item.kind === "image"
								? (
									<img
										src={`${srcPrefix}/${encodeURIComponent(item.path)}`}
										alt={item.name || "Image jointe"}
									/>
								)
								: (
									<a
										href={`${srcPrefix}/${encodeURIComponent(item.path)}`}
										target="_blank"
										rel="noreferrer"
									>
										{item.name || item.path}
									</a>
								)}
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
