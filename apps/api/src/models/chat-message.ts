import {
	type CreationOptional,
	DataTypes,
	type InferAttributes,
	type InferCreationAttributes,
	Model,
	type NonAttribute,
} from "@sequelize/core";
import { Attribute, BelongsTo, Default, NotNull, PrimaryKey } from "@sequelize/core/decorators-legacy";

import type { ChatFileKind } from "@magi/shared/types/chat-file";
import { Lecture } from "./lecture.ts";

export enum ChatRole {
	USER = "user",
	ASSISTANT = "assistant",
}

export type ChatAttachment = {
	kind: ChatFileKind;
	path: string;
	name?: string;
	text?: string;
};

export class ChatMessage extends Model<InferAttributes<ChatMessage>, InferCreationAttributes<ChatMessage>> {
	@Attribute(DataTypes.UUID)
	@Default(DataTypes.UUIDV4)
	@PrimaryKey
	declare id: CreationOptional<string>;

	@Attribute(DataTypes.UUID)
	@NotNull
	declare lectureId: string;

	@BelongsTo(() => Lecture, "lectureId")
	declare lecture?: NonAttribute<Lecture>;

	@Attribute(DataTypes.ENUM(...Object.values(ChatRole)))
	@NotNull
	declare role: ChatRole;

	@Attribute(DataTypes.TEXT)
	@NotNull
	declare content: string;

	@Attribute(DataTypes.JSON)
	declare attachments: ChatAttachment[] | null;

	declare createdAt: CreationOptional<Date>;
	declare updatedAt: CreationOptional<Date>;
}
