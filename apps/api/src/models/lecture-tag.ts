import { DataTypes, type InferAttributes, type InferCreationAttributes, Model } from "@sequelize/core";
import { Attribute, NotNull, PrimaryKey, Table } from "@sequelize/core/decorators-legacy";

@Table({ timestamps: false })
export class LectureTag extends Model<InferAttributes<LectureTag>, InferCreationAttributes<LectureTag>> {
	@Attribute(DataTypes.UUID)
	@PrimaryKey
	@NotNull
	declare lectureId: string;

	@Attribute(DataTypes.UUID)
	@PrimaryKey
	@NotNull
	declare tagId: string;
}
