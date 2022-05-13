import {
  BufferSchema,
  Model,
  uint8,
  uint64,
  int64,
  string8,
} from "@geckos.io/typed-array-buffer-schema";

const id = { type: string8, length: 6 };

export default new Model(
  BufferSchema.schema("snapshot", {
    id,
    time: uint64,
    state: {
      persons: [
        BufferSchema.schema("person", {
          id,
          x: int64,
          y: int64,
          sprite: uint8,
          animation: uint8,
        }),
      ],
    },
  })
);

